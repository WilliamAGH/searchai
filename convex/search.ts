"use node";

/**
 * Search functions - Node runtime
 * Provides web search via multiple providers and intelligent query planning
 */

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import {
  vSearchResult,
  vSerpEnrichment,
  vSearchMethod,
} from "./lib/validators";
import { runPlanSearch } from "./search/plan_search_handler";
import { runSearchWeb } from "./search/search_web_handler";
import { invalidatePlanCacheForChat as invalidateCacheForChat } from "./search/cache";

// Re-export test utilities for backward compatibility
export {
  __extractKeywordsForTest,
  __augmentQueryForTest,
} from "./search/utils";

/**
 * Perform web search using available providers
 * Tries: SERP API -> OpenRouter -> DuckDuckGo -> Fallback
 */
export const searchWeb = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(vSearchResult),
    searchMethod: vSearchMethod,
    hasRealResults: v.boolean(),
    enrichment: v.optional(vSerpEnrichment),
    // Error tracking - present when fallback was used due to provider failures
    providerErrors: v.optional(
      v.array(v.object({ provider: v.string(), error: v.string() })),
    ),
    allProvidersFailed: v.optional(v.boolean()),
  }),
  handler: async (_ctx, args) => runSearchWeb(args),
});

/**
 * Plan context-aware web search with LLM assistance
 */
export const planSearch = action({
  args: {
    chatId: v.id("chats"),
    newMessage: v.string(),
    sessionId: v.optional(v.string()),
    maxContextMessages: v.optional(v.number()),
  },
  returns: v.object({
    shouldSearch: v.boolean(),
    contextSummary: v.string(),
    queries: v.array(v.string()),
    suggestNewChat: v.boolean(),
    decisionConfidence: v.number(),
    reasons: v.string(),
  }),
  handler: async (ctx, args) => runPlanSearch(ctx, args),
});

/** Invalidate planner cache for a chat */
export const invalidatePlanCacheForChat = internalAction({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    invalidateCacheForChat(args.chatId);
    return null;
  },
});

// NOTE: Metrics mutations are defined in ./search/metrics.ts
// They cannot be re-exported from this Node.js runtime module.
// Import directly: import { recordMetric } from "./search/metrics";

// NOTE: scrapeUrl action is available at api.search.scraper_action.scrapeUrl
// It's a Node.js action and cannot be re-exported from this V8-runtime module
