"use node";

/**
 * Workflow Persistence Helpers
 *
 * Extracted from orchestration.ts per [DR1a] to eliminate duplicate patterns
 * for chat title updates, message persistence, and workflow completion.
 *
 * These helpers require the Node.js runtime for Convex action context operations.
 * See [CX1g] - only actions may run in the Node.js runtime.
 */

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateChatTitle } from "../chats/utils";
import type {
  ResearchContextReference,
  StreamingPersistPayload,
} from "./schema";

// ============================================
// Types
// ============================================
// Design Decision: Parameter Objects
// -----------------------------------
// These interfaces use parameter objects instead of positional arguments because:
// 1. Functions have 4+ parameters, making positional calls error-prone
// 2. Named parameters are self-documenting at call sites
// 3. Optional fields (sessionId, searchResults, etc.) are cleaner with objects
// 4. Adding new optional parameters doesn't break existing callers
// 5. TypeScript provides full autocomplete and type checking
//
// The PersistAssistantMessageParams interface has 7 fields because message
// persistence requires all this data - the alternative would be multiple
// function calls or a less type-safe approach.

/**
 * Minimal context needed for persistence operations.
 * Uses Pick<ActionCtx, ...> pattern matching StreamingWorkflowCtx in orchestration.ts
 * for proper type inference on Convex mutation/query/action calls.
 */
export type WorkflowActionCtx = Pick<
  ActionCtx,
  "runMutation" | "runQuery" | "runAction"
>;

/** Parameters for chat title update */
export interface UpdateChatTitleParams {
  ctx: WorkflowActionCtx;
  chatId: Id<"chats">;
  currentTitle: string | undefined;
  intent: string;
}

/**
 * Parameters for assistant message persistence.
 * Fields map directly to internal.messages.addMessage arguments.
 */
export interface PersistAssistantMessageParams {
  /** Convex action context for running mutations */
  ctx: WorkflowActionCtx;
  /** Target chat for the message */
  chatId: Id<"chats">;
  /** Message content (markdown text) */
  content: string;
  /** Workflow ID for tracing */
  workflowId: string;
  /** Optional session ID for HTTP action auth */
  sessionId?: string;
  /** Search results with relevance scores for citation UI */
  searchResults?: Array<{
    title: string;
    url: string;
    snippet: string;
    relevanceScore: number;
  }>;
  /** Source URLs referenced in the response */
  sources?: string[];
  /** Structured context references for provenance tracking */
  contextReferences?: ResearchContextReference[];
}

/** Parameters for workflow completion */
export interface CompleteWorkflowParams {
  ctx: WorkflowActionCtx;
  workflowTokenId: Id<"workflowTokens"> | null;
  payload: StreamingPersistPayload;
  nonce: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Update chat title if it's still the default "New Chat".
 * Uses generateChatTitle utility which enforces 25-char limit.
 *
 * @see {@link ../chats/utils.ts} - generateChatTitle source
 */
export async function updateChatTitleIfNeeded(
  params: UpdateChatTitleParams,
): Promise<void> {
  const { ctx, chatId, currentTitle, intent } = params;

  if (currentTitle === "New Chat" || !currentTitle) {
    const generatedTitle = generateChatTitle({ intent });
    // @ts-ignore - Known Convex TS2589 issue with complex type inference in ctx.runMutation
    await ctx.runMutation(internal.chats.internalUpdateChatTitle, {
      chatId,
      title: generatedTitle,
    });
  }
}

/**
 * Persist an assistant message to the database.
 * Returns the created message ID.
 *
 * @see {@link ../messages.ts} - addMessage mutation
 */
export async function persistAssistantMessage(
  params: PersistAssistantMessageParams,
): Promise<Id<"messages">> {
  const {
    ctx,
    chatId,
    content,
    workflowId,
    sessionId,
    searchResults = [],
    sources = [],
    contextReferences = [],
  } = params;

  const messageId = await ctx.runMutation(internal.messages.addMessageHttp, {
    chatId,
    role: "assistant",
    content,
    searchResults,
    sources,
    contextReferences,
    workflowId,
    isStreaming: false,
    sessionId,
  });

  return messageId;
}

/**
 * Complete a workflow by signing the payload and marking the token complete.
 * Returns the signature for the persisted event.
 *
 * @see {@link ../workflowTokensActions.ts} - signPersistedPayload action
 * @see {@link ../workflowTokens.ts} - completeToken mutation
 */
export async function completeWorkflowWithSignature(
  params: CompleteWorkflowParams,
): Promise<string> {
  const { ctx, workflowTokenId, payload, nonce } = params;

  const signature = await ctx.runAction(
    internal.workflowTokensActions.signPersistedPayload,
    { payload, nonce },
  );

  if (workflowTokenId) {
    await ctx.runMutation(internal.workflowTokens.completeToken, {
      tokenId: workflowTokenId,
      signature,
    });
  }

  return signature;
}

/**
 * Combined helper to persist message and complete workflow.
 * Encapsulates the common pattern: persist -> payload -> sign -> return details.
 */
export async function persistAndCompleteWorkflow(
  params: PersistAssistantMessageParams & {
    workflowTokenId: Id<"workflowTokens"> | null;
    nonce: string;
  },
): Promise<{
  payload: StreamingPersistPayload;
  signature: string;
}> {
  const assistantMessageId = await persistAssistantMessage(params);

  const payload: StreamingPersistPayload = {
    assistantMessageId,
    workflowId: params.workflowId,
    answer: params.content,
    sources: params.sources || [],
    contextReferences: params.contextReferences || [],
  };

  const signature = await completeWorkflowWithSignature({
    ctx: params.ctx,
    workflowTokenId: params.workflowTokenId,
    payload,
    nonce: params.nonce,
  });

  return { payload, signature };
}
