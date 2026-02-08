"use node";

import { logWorkflow } from "./workflow_logger";
import {
  buildInstantCompleteEvent,
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

interface InstantPathArgs {
  ctx: WorkflowActionCtx;
  args: StreamingWorkflowArgs;
  workflowId: string;
  nonce: string;
  workflowTokenId: Id<"workflowTokens"> | null;
  chat: { title?: string };
  instantResponse: string;
  startTime: number;
}

export async function* executeInstantPath({
  ctx,
  args,
  workflowId,
  nonce,
  workflowTokenId,
  chat,
  instantResponse,
  startTime,
}: InstantPathArgs): AsyncGenerator<WorkflowStreamEvent> {
  const writeEvent = (type: string, data: Record<string, unknown>) =>
    createWorkflowEvent(type, data);

  logWorkflow(
    "INSTANT_RESPONSE",
    "Skipping all agent calls for simple message",
  );

  yield writeEvent("progress", {
    stage: "generating",
    message: "Responding...",
  });

  yield writeEvent("content", { delta: instantResponse });

  // Emit metadata before complete per SSE spec (complete is terminal for some clients)
  yield writeEvent(
    "metadata",
    buildMetadataEvent({
      workflowId,
      webResearchSources: [],
      hasLimitations: false,
      confidence: 1,
      answerLength: instantResponse.length,
      nonce,
    }),
  );

  yield writeEvent(
    "complete",
    buildInstantCompleteEvent({
      workflowId,
      userQuery: args.userQuery,
      answer: instantResponse,
      startTime,
    }),
  );

  await updateChatTitleIfNeeded({
    ctx,
    chatId: args.chatId,
    currentTitle: chat.title,
    intent: args.userQuery,
  });

  const { payload: instantPayload, signature: instantSignature } =
    await persistAndCompleteWorkflow({
      ctx,
      chatId: args.chatId,
      content: instantResponse,
      workflowId,
      sessionId: args.sessionId,
      webResearchSources: [],
      workflowTokenId,
      nonce,
    });

  yield writeEvent("persisted", {
    payload: instantPayload,
    nonce,
    signature: instantSignature,
  });
}
