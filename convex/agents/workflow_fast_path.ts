"use node";

import { logWorkflow } from "./workflow_logger";
import { executeFastSynthesis } from "./synthesis_executor";
import {
  buildCompleteEvent,
  buildMetadataEvent,
  createWorkflowEvent,
} from "./workflow_events";
import type { WorkflowStreamEvent } from "./workflow_event_types";
import {
  updateChatTitleIfNeeded,
  persistAndCompleteWorkflow,
  type WorkflowActionCtx,
} from "./orchestration_persistence";
import type { Id } from "../_generated/dataModel";
import type { StreamingWorkflowArgs } from "./orchestration_session";
import type { PlanningOutput } from "./schema";

interface FastPathArgs {
  ctx: WorkflowActionCtx;
  args: StreamingWorkflowArgs;
  workflowId: string;
  nonce: string;
  workflowTokenId: Id<"workflowTokens"> | null;
  chat: { title?: string };
  startTime: number;
  planningOutput: PlanningOutput;
}

export async function* executeFastPath({
  ctx,
  args,
  workflowId,
  nonce,
  workflowTokenId,
  chat,
  startTime,
  planningOutput,
}: FastPathArgs): AsyncGenerator<WorkflowStreamEvent> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  for await (const synthEvent of fastSynthesisGenerator) {
    if (synthEvent.type === "progress") {
      yield writeEvent("progress", {
        stage: synthEvent.stage,
        message: synthEvent.message,
      });
    } else if (synthEvent.type === "content") {
      yield writeEvent("content", { delta: synthEvent.delta });
    }
  }

  const fastSynthesisResult = await fastSynthesisGenerator.next();
  const fastResult =
    fastSynthesisResult.value as import("./synthesis_executor").SynthesisResult;
  const fastFinalAnswerText = fastResult.answer;
  const fastParsedAnswer = fastResult.parsedAnswer;

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

  yield writeEvent(
    "metadata",
    buildMetadataEvent({
      workflowId,
      contextReferences: [],
      hasLimitations: fastParsedAnswer.hasLimitations,
      confidence: fastParsedAnswer.confidence,
      answerLength: fastFinalAnswerText.length,
      nonce,
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
      searchResults: [],
      sources: fastParsedAnswer.sourcesUsed || [],
      contextReferences: [],
      workflowTokenId,
      nonce,
    });

  yield writeEvent("persisted", {
    payload: fastPersistedPayload,
    nonce,
    signature: fastSignature,
  });
}
