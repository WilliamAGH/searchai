"use node";

import { logWorkflow } from "./workflow_logger";
import { executeFastSynthesis } from "./synthesis_executor";
import {
  buildCompleteEvent,
  buildMetadataEvent,
  createWorkflowEvent,
} from "./workflow_events";
import type {
  WorkflowStreamEvent,
  WorkflowPathArgs,
} from "./workflow_event_types";
import {
  updateChatTitleIfNeeded,
  persistAndCompleteWorkflow,
} from "./orchestration_persistence";
import { mapAsyncGenerator, mapSynthesisEvent } from "./workflow_utils";

export async function* executeFastPath({
  ctx,
  args,
  workflowId,
  nonce,
  workflowTokenId,
  chat,
  startTime,
  planningOutput,
}: WorkflowPathArgs): AsyncGenerator<WorkflowStreamEvent> {
  const { agents } = require("./definitions");

  const writeEvent = (type: string, data: Record<string, unknown>) =>
    createWorkflowEvent(type, data);

  logWorkflow("FAST_PATH", "Skipping research stage for simple message");

  const fastSynthesisGenerator = executeFastSynthesis({
    ctx,
    synthesisAgent: agents.answerSynthesis,
    userQuery: args.userQuery,
    userIntent: planningOutput.userIntent,
  });

  // Use mapAsyncGenerator to consume the generator and capture its return value
  const fastResult = yield* mapAsyncGenerator(fastSynthesisGenerator, (event) =>
    mapSynthesisEvent(event, writeEvent),
  );
  const fastFinalAnswerText = fastResult.answer;
  const fastParsedAnswer = fastResult.parsedAnswer;

  // Emit metadata before complete per SSE spec (complete is terminal for some clients)
  yield writeEvent(
    "metadata",
    buildMetadataEvent({
      workflowId,
      webResearchSources: [],
      hasLimitations: fastParsedAnswer.hasLimitations,
      confidence: fastParsedAnswer.confidence,
      answerLength: fastFinalAnswerText.length,
      nonce,
    }),
  );

  yield writeEvent(
    "complete",
    buildCompleteEvent({
      workflowId,
      userQuery: args.userQuery,
      answer: fastFinalAnswerText,
      startTime,
      planning: {
        ...planningOutput,
        anticipatedChallenges:
          planningOutput.anticipatedChallenges ?? undefined,
      },
      research: {
        researchSummary:
          "No research required for this conversational message.",
        keyFindings: [],
        sourcesUsed: [],
        researchQuality: "adequate",
      },
      hasLimitations: fastParsedAnswer.hasLimitations,
      confidence: fastParsedAnswer.confidence,
      answerCompleteness: fastParsedAnswer.answerCompleteness,
    }),
  );

  await updateChatTitleIfNeeded({
    ctx,
    chatId: args.chatId,
    currentTitle: chat.title,
    intent: planningOutput?.userIntent || args.userQuery,
  });

  const { payload: fastPersistedPayload, signature: fastSignature } =
    await persistAndCompleteWorkflow({
      ctx,
      chatId: args.chatId,
      content: fastFinalAnswerText,
      workflowId,
      sessionId: args.sessionId,
      webResearchSources: [],
      workflowTokenId,
      nonce,
    });

  yield writeEvent("persisted", {
    payload: fastPersistedPayload,
    nonce,
    signature: fastSignature,
  });
}
