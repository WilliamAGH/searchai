"use node";

/**
 * Workflow Session Initialization
 *
 * Extracted from orchestration.ts per [CC1b] DRY and Single Responsibility.
 * Handles workflow session setup: token creation, chat verification, history fetch.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 * @see {@link ./orchestration_persistence.ts} - persistence operations (separate concern)
 */

import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { CACHE_TTL, CONTENT_LIMITS } from "../lib/constants/cache";
import { getErrorMessage } from "../lib/errors";
import { buildConversationContext } from "./helpers_builders";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import type { ChatQueryResult, MessageQueryResult } from "../schemas/agents";
import type { WebResearchSource } from "../lib/validators";

// ============================================
// Types
// ============================================

/**
 * Arguments for streaming workflow functions.
 */
export interface StreamingWorkflowArgs {
  chatId: Id<"chats">;
  sessionId?: string;
  userQuery: string;
  conversationContext?: string;
  webResearchSources?: WebResearchSource[];
  includeDebugSourceContext?: boolean;
  imageStorageIds?: Id<"_storage">[];
}

/**
 * Result of workflow session initialization.
 */
export interface WorkflowSessionResult {
  workflowTokenId: Id<"workflowTokens">;
  chat: ChatQueryResult;
  conversationContext: string;
  imageUrls: string[];
  imageAnalysis?: string;
}

// ============================================
// Error Context Helper
// ============================================

/**
 * Wrap a Convex call with explicit error context.
 * Adds operation context to errors for better debugging.
 */
export async function withErrorContext<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(
      `${operation}: ${getErrorMessage(error, "Unknown error occurred")}`,
      { cause: error },
    );
  }
}

// ============================================
// Session Initialization
// ============================================

/**
 * Initialize workflow session: create token, verify chat, fetch history, add user message.
 *
 * This function handles the common setup required by both streaming workflows:
 * 1. Create workflow token for SSE signature verification
 * 2. Verify chat exists and user has access
 * 3. Fetch recent message history for context
 * 4. Add the user's message to the chat
 * 5. Build conversation context string
 *
 * @param ctx - Convex action context
 * @param args - Workflow arguments (chatId, userQuery, etc.)
 * @param workflowId - Unique ID for this workflow execution
 * @param nonce - Cryptographic nonce for payload signing
 * @returns Session result with token ID, chat, and conversation context
 */
export async function initializeWorkflowSession(
  ctx: WorkflowActionCtx,
  args: StreamingWorkflowArgs,
  workflowId: string,
  nonce: string,
): Promise<WorkflowSessionResult> {
  // Write-access gate: check BEFORE minting a workflow token.
  // Infrastructure failures (network, Convex errors) are caught separately
  // from auth denial and not-found — keep the three failure modes distinct.
  let writeAccess: "allowed" | "denied" | "not_found";
  try {
    writeAccess = await ctx.runQuery(api.chats.canWriteChat, {
      chatId: args.chatId,
      sessionId: args.sessionId,
    });
  } catch (queryError) {
    throw new Error(
      `Failed to verify write access for chat ${args.chatId}: ` +
        `${getErrorMessage(queryError, "query failed")}`,
      { cause: queryError },
    );
  }
  if (writeAccess === "not_found") {
    throw new Error(`Chat not found: ${args.chatId}`);
  }
  if (writeAccess === "denied") {
    throw new Error(
      `Unauthorized: no write access to chat ${args.chatId} ` +
        `(sessionId=${args.sessionId ? "present" : "absent"})`,
    );
  }

  // 1. Create workflow token
  const issuedAt = Date.now();
  const workflowTokenPayload: {
    workflowId: string;
    nonce: string;
    chatId: Id<"chats">;
    sessionId?: string;
    issuedAt: number;
    expiresAt: number;
  } = {
    workflowId,
    nonce,
    chatId: args.chatId,
    issuedAt,
    expiresAt: issuedAt + CACHE_TTL.WORKFLOW_TOKEN_MS,
  };

  if (args.sessionId) {
    workflowTokenPayload.sessionId = args.sessionId;
  }

  const workflowTokenId = await withErrorContext(
    "Failed to create workflow token",
    () =>
      ctx.runMutation(
        // @ts-ignore - Convex api type instantiation is too deep here
        internal.workflowTokens.createToken,
        workflowTokenPayload,
      ),
  );

  // 2. Get chat and verify access
  const getChatArgs: { chatId: Id<"chats">; sessionId?: string } = {
    chatId: args.chatId,
  };
  if (args.sessionId) getChatArgs.sessionId = args.sessionId;

  // Select query variant based on sessionId presence:
  // - When sessionId is missing: use auth-aware queries that call getAuthUserId(ctx).
  //   Note: If this is called from an HTTP action, getAuthUserId returns null,
  //   so only shared/public chats will be accessible (not private user chats).
  // - When sessionId is provided: use HTTP-optimized queries with session-based access.
  const useAuthVariant = !args.sessionId;

  let chat: ChatQueryResult | null;
  if (useAuthVariant) {
    chat = await withErrorContext("Failed to retrieve chat", () =>
      // @ts-ignore - Convex api type instantiation is too deep here
      ctx.runQuery(api.chats.getChatById, getChatArgs),
    );
  } else {
    chat = await withErrorContext("Failed to retrieve chat", () =>
      ctx.runQuery(api.chats.getChatByIdHttp, {
        ...getChatArgs,
        workflowTokenId,
      }),
    );
  }
  if (!chat) throw new Error("Chat not found or access denied");

  // 3. Get recent messages (Fetch FIRST to exclude current query)
  const getMessagesArgs: {
    chatId: Id<"chats">;
    sessionId?: string;
    limit?: number;
  } = {
    chatId: args.chatId,
    limit: CONTENT_LIMITS.MAX_CONTEXT_MESSAGES,
  };
  if (args.sessionId) getMessagesArgs.sessionId = args.sessionId;

  let recentMessagesResult: MessageQueryResult[] | null;
  if (useAuthVariant) {
    recentMessagesResult = await withErrorContext(
      "Failed to retrieve chat messages",
      () => ctx.runQuery(api.chats.getChatMessages, getMessagesArgs),
    );
  } else {
    recentMessagesResult = await withErrorContext(
      "Failed to retrieve chat messages",
      () =>
        ctx.runQuery(api.chats.getChatMessagesHttp, {
          ...getMessagesArgs,
          workflowTokenId,
        }),
    );
  }

  const recentMessages = (recentMessagesResult ?? []) as Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    imageAnalysis?: string;
  }>;

  // 4. Build context
  let conversationContext = buildConversationContext(recentMessages || []);
  if (!conversationContext && args.conversationContext) {
    console.warn(
      "buildConversationContext returned empty; using args.conversationContext",
      {
        chatId: args.chatId,
        recentMessageCount: recentMessages.length,
        clientContextLength: args.conversationContext.length,
      },
    );
    // Keep newest context when falling back to client-provided conversationContext.
    conversationContext = args.conversationContext.slice(
      -CONTENT_LIMITS.MAX_CONTEXT_CHARS,
    );
  }
  if (!conversationContext) {
    conversationContext = "";
  }

  // 5. Resolve image storage IDs to serving URLs via batch query
  const imageUrls = await resolveImageUrls(ctx, args);

  // 6. Vision pre-analysis: generate structured description of attached images
  let imageAnalysis: string | undefined;
  if (imageUrls.length > 0) {
    try {
      const { analyzeImages } = await import("./vision_analysis");
      const result = await analyzeImages({
        imageUrls,
        userQuery: args.userQuery,
      });
      imageAnalysis = result.description;
    } catch (analysisError) {
      console.warn(
        "[vision_analysis] Failed for chat=%s imageCount=%d: %s",
        args.chatId,
        imageUrls.length,
        getErrorMessage(analysisError, "Unknown vision analysis error"),
      );
      throw new Error(
        "Unable to analyze the attached image(s). Ensure the configured model/endpoint supports image inputs and try again.",
        { cause: analysisError },
      );
    }
  }

  // 7. Add user message (after vision pre-analysis so we don't persist partial state)
  const addMessageArgs = {
    chatId: args.chatId,
    role: "user" as const,
    content: args.userQuery,
    sessionId: args.sessionId,
    ...(args.imageStorageIds?.length
      ? { imageStorageIds: args.imageStorageIds }
      : {}),
    ...(imageAnalysis ? { imageAnalysis } : {}),
  };

  if (useAuthVariant) {
    await withErrorContext("Failed to save user message", () =>
      ctx.runMutation(internal.messages.addMessage, addMessageArgs),
    );
  } else {
    await withErrorContext("Failed to save user message", () =>
      ctx.runMutation(internal.messages.addMessageHttp, {
        ...addMessageArgs,
        workflowTokenId,
      }),
    );
  }

  return {
    workflowTokenId,
    chat,
    conversationContext,
    imageUrls,
    imageAnalysis,
  };
}

/**
 * Resolve image storage IDs to serving URLs. Throws if any URL fails to resolve
 * so the caller is aware of the failure rather than receiving a silently reduced set.
 */
async function resolveImageUrls(
  ctx: WorkflowActionCtx,
  args: Pick<StreamingWorkflowArgs, "imageStorageIds" | "sessionId" | "chatId">,
): Promise<string[]> {
  if (!args.imageStorageIds?.length) return [];

  const resolved = await ctx.runQuery(api.storage.getFileUrls, {
    storageIds: args.imageStorageIds,
    chatId: args.chatId,
    sessionId: args.sessionId,
  });

  const failedCount = resolved.filter((url) => url === null).length;
  if (failedCount > 0) {
    throw new Error(
      `${failedCount}/${args.imageStorageIds.length} image storage IDs ` +
        `failed to resolve for chat ${args.chatId}`,
    );
  }

  // All entries are non-null after the check above
  return resolved.filter((url): url is string => url !== null);
}
