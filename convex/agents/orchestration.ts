"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { vContextReference } from "../lib/validators";
import { streamConversationalWorkflow } from "./workflow_conversational";
import type { StreamingPersistPayload } from "../schemas/agents";
import { ensureCustomEventPolyfill } from "./workflow_utils";

// Ensure polyfill is loaded
ensureCustomEventPolyfill();

// Re-export workflows
export { orchestrateResearchWorkflow } from "./orchestration_nonstreaming";
export { streamConversationalWorkflow } from "./workflow_conversational";
export { streamResearchWorkflow } from "./workflow_research";

// Re-export types
export type { StreamingWorkflowArgs } from "./orchestration_session";
export type { ResearchContextReference } from "../schemas/agents";

// --------------------------------------------
// Non-streaming workflow with persistence
// --------------------------------------------
export const runAgentWorkflowAndPersist = action({
  args: {
    chatId: v.id("chats"),
    message: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    assistantMessageId: v.string(),
    workflowId: v.string(),
    answer: v.string(),
    sources: v.array(v.string()),
    contextReferences: v.array(vContextReference),
    signature: v.string(),
  }),
  // @ts-ignore TS2589 - Convex type instantiation is excessively deep with complex return validators
  handler: async (ctx, args) => {
    const eventStream = streamConversationalWorkflow(ctx, {
      chatId: args.chatId,
      sessionId: args.sessionId,
      userQuery: args.message,
      conversationContext: undefined,
      contextReferences: undefined,
    });

    let persisted: {
      payload: StreamingPersistPayload;
      signature: string;
    } | null = null;

    for await (const event of eventStream) {
      if (event.type === "persisted") {
        const candidate = event as {
          payload?: StreamingPersistPayload;
          signature?: string;
        };
        if (candidate.payload && candidate.signature) {
          persisted = {
            payload: candidate.payload,
            signature: candidate.signature,
          };
        }
      }
    }

    if (!persisted) {
      throw new Error("Workflow did not persist payload");
    }

    return {
      assistantMessageId: persisted.payload.assistantMessageId,
      workflowId: persisted.payload.workflowId,
      answer: persisted.payload.answer,
      sources: persisted.payload.sources,
      contextReferences: persisted.payload.contextReferences,
      signature: persisted.signature,
    };
  },
});
