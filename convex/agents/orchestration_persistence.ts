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
import { internal } from "../_generated/api";
import { generateChatTitle } from "../chats/utils";
import type {
  ResearchContextReference,
  StreamingPersistPayload,
} from "./schema";

// ============================================
// Types
// ============================================

/** Minimal context needed for persistence operations */
type PersistenceCtx = {
  runMutation: (fn: any, args: any) => Promise<any>;
  runQuery: (fn: any, args: any) => Promise<any>;
  runAction: (fn: any, args: any) => Promise<any>;
};

/** Parameters for chat title update */
export interface UpdateChatTitleParams {
  ctx: PersistenceCtx;
  chatId: Id<"chats">;
  currentTitle: string | undefined;
  intent: string;
}

/** Parameters for assistant message persistence */
export interface PersistAssistantMessageParams {
  ctx: PersistenceCtx;
  chatId: Id<"chats">;
  content: string;
  workflowId: string;
  sessionId?: string;
  searchResults?: Array<{
    title: string;
    url: string;
    snippet: string;
    relevanceScore: number;
  }>;
  sources?: string[];
  contextReferences?: ResearchContextReference[];
}

/** Parameters for workflow completion */
export interface CompleteWorkflowParams {
  ctx: PersistenceCtx;
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
    // @ts-expect-error - Convex TS2589: deeply nested type inference
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

  const messageId = (await ctx.runMutation(internal.messages.addMessage, {
    chatId,
    role: "assistant",
    content,
    searchResults,
    sources,
    contextReferences,
    workflowId,
    isStreaming: false,
    sessionId,
  })) as Id<"messages">;

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
