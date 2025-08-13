/**
 * Search functions - V8 runtime only
 * Provides web search via multiple providers and intelligent query planning
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";

// Import search providers
import {
  searchWithOpenRouter,
  searchWithSerpApiDuckDuckGo,
  searchWithDuckDuckGo,
} from "./search/providers";

// Import utilities
import {
  __extractKeywordsForTest,
  __augmentQueryForTest,
  extractKeyEntities,
  serialize,
  tokSet,
  jaccard,
  diversifyQueries,
} from "./search/utils";

// Import cache management
import {
  type PlanResult,
  planCache,
  cleanupExpiredCache,
  checkRateLimit,
  recordRateLimitAttempt,
  getCachedPlan,
  setCachedPlan,
  getCachedSearchResults,
  setCachedSearchResults,
  invalidatePlanCacheForChat as invalidateCacheForChat,
} from "./search/cache";

import { buildContextSummary } from "./chats/utils";
import {
  SEARCH_PLANNER_SYSTEM_PROMPT,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from "./search/prompts";

// Re-export test utilities for backward compatibility
export { __extractKeywordsForTest, __augmentQueryForTest };

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
    results: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.string(),
        relevanceScore: v.number(),
      }),
    ),
    searchMethod: v.union(
      v.literal("serp"),
      v.literal("openrouter"),
      v.literal("duckduckgo"),
      v.literal("fallback"),
    ),
    hasRealResults: v.boolean(),
  }),
  handler: async (_ctx, args) => {
    const maxResults = args.maxResults || 5;
    const trimmedQuery = args.query.trim();

    if (trimmedQuery.length === 0) {
      return {
        results: [],
        searchMethod: "fallback" as const,
        hasRealResults: false,
      };
    }

    // Check cache first
    const cacheKey = `search:${trimmedQuery}:${maxResults}`;
    const cached = getCachedSearchResults(cacheKey);

    if (cached) {
      return cached;
    }

    // Try SERP API for DuckDuckGo first if available
    if (process.env.SERP_API_KEY) {
      try {
        const serpResults = await searchWithSerpApiDuckDuckGo(
          args.query,
          maxResults,
        );
        if (serpResults.length > 0) {
          const result = {
            results: serpResults,
            searchMethod: "serp" as const,
            hasRealResults: true,
          };
          // Cache the successful result
          setCachedSearchResults(cacheKey, result);
          return result;
        }
      } catch (error) {
        console.warn("SERP API failed:", error);
      }
    }

    // Try OpenRouter web search as fallback
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const openRouterResults = await searchWithOpenRouter(
          args.query,
          maxResults,
        );
        if (openRouterResults.length > 0) {
          return {
            results: openRouterResults,
            searchMethod: "openrouter" as const,
            hasRealResults: true,
          };
        }
      } catch (error) {
        console.warn("OpenRouter search failed:", error);
      }
    }

    // Try DuckDuckGo direct API as backup
    try {
      const ddgResults = await searchWithDuckDuckGo(args.query, maxResults);
      if (ddgResults.length > 0) {
        return {
          results: ddgResults,
          searchMethod: "duckduckgo" as const,
          hasRealResults: ddgResults.some((r) => r.relevanceScore > 0.6),
        };
      }
    } catch (error) {
      console.warn("DuckDuckGo search failed:", error);
    }

    // Final fallback - return minimal search links
    const fallbackResults = [
      {
        title: `Search for: ${args.query}`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
        snippet:
          "Search results temporarily unavailable. Click to search manually.",
        relevanceScore: 0.3,
      },
    ];

    return {
      results: fallbackResults,
      searchMethod: "fallback" as const,
      hasRealResults: false,
    };
  },
});

/**
 * Plan context-aware web search with LLM assistance
 */
export const planSearch = action({
  args: {
    chatId: v.id("chats"),
    newMessage: v.string(),
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
  handler: async (ctx, args) => {
    const now = Date.now();
    // Note: Metrics recording removed from action context due to TS2589
    // Metrics are handled at the frontend layer instead
    // Short-circuit on empty input to avoid unnecessary planning/LLM calls
    if (args.newMessage.trim().length === 0) {
      const emptyPlan = {
        shouldSearch: false,
        contextSummary: "",
        queries: [],
        suggestNewChat: false,
        decisionConfidence: 0.9,
        reasons: "empty_input",
      } as PlanResult;
      // Cache under normalized empty key to prevent repeat work
      const cacheKey = `${args.chatId}|`;
      setCachedPlan(cacheKey, emptyPlan);
      // Best-effort metric - skip to avoid TS2589 (action context doesn't have DB access)
      // Metrics are recorded elsewhere in the flow
      return emptyPlan;
    }
    // Clean up expired cache entries (best-effort)
    cleanupExpiredCache(planCache, now);
    // Cache key: chat + normalized message (first 200 chars)
    const normMsg = args.newMessage.toLowerCase().trim().slice(0, 200);
    // Strengthen cache key with message count to avoid over-hit on same prefix
    const messageCountKey = (
      await ctx.runQuery(api.chats.getChatMessages, { chatId: args.chatId })
    ).length;
    const cacheKey = `${args.chatId}|${normMsg}|${messageCountKey}`;
    // Rate limit check
    const { isLimited } = checkRateLimit(args.chatId, now);
    if (isLimited) {
      // Too many plan calls; serve default plan (also cached)
      const fallback = {
        shouldSearch: true,
        contextSummary: "",
        queries: [args.newMessage],
        suggestNewChat: false,
        decisionConfidence: 0.5,
        reasons: "rate_limited",
      } as PlanResult;
      setCachedPlan(cacheKey, fallback);
      // telemetry - handled at frontend layer due to TS2589 in action context
      return fallback;
    }
    // Record this attempt in the rate bucket
    recordRateLimitAttempt(args.chatId, now);
    const cachedPlan = getCachedPlan(cacheKey, now);
    if (cachedPlan) {
      // Metrics recorded at frontend layer
      return cachedPlan;
    }

    const maxContext = Math.max(1, Math.min(args.maxContextMessages ?? 10, 25));

    // Load recent messages for lightweight context summary
    const messages: any[] = await ctx.runQuery(api.chats.getChatMessages, {
      chatId: args.chatId,
    });
    // Prefer server-stored rolling summary if present (reduces tokens)
    const chat = await ctx.runQuery(api.chats.getChatById, {
      chatId: args.chatId,
    });

    const recent: any[] = messages.slice(
      Math.max(0, messages.length - maxContext),
    );

    // Simple lexical overlap heuristic with the previous user message
    const newContent = serialize(args.newMessage);
    const prevUser =
      [...recent]
        .reverse()
        .find(
          (m: any) => m.role === "user" && serialize(m.content) !== newContent,
        ) || [...recent].reverse().find((m: any) => m.role === "user");
    const jaccardScore = jaccard(
      tokSet(serialize(prevUser?.content)),
      tokSet(newContent),
    );

    // Time-based heuristic
    const lastTs = prevUser?.timestamp as number | undefined;
    const minutesGap = lastTs ? Math.floor((Date.now() - lastTs) / 60000) : 0;
    const timeSuggestNew = minutesGap >= 120;

    // DRY: Use shared summarizer (recency-weighted, includes rolling summary)
    const contextSummary = buildContextSummary({
      messages: recent.map((m: any) => ({
        role: m.role,
        content: serialize(m.content),
        timestamp: m.timestamp,
      })),
      rollingSummary: (chat as any)?.rollingSummary,
      maxChars: 1600,
    });

    // Default plan if no LLM is available or JSON parsing fails
    let defaultPlan: PlanResult = {
      shouldSearch: true,
      contextSummary,
      queries: [args.newMessage],
      suggestNewChat: timeSuggestNew ? true : jaccardScore < 0.5,
      decisionConfidence: timeSuggestNew ? 0.85 : 0.65,
      reasons: `jaccard=${jaccardScore.toFixed(2)} gapMin=${minutesGap}`,
    };
    // Diversify queries (MMR) from simple context-derived variants
    try {
      const ctxTokens = Array.from(tokSet(contextSummary))
        .filter((t) => t.length > 3)
        .slice(0, 10);
      const variants: string[] = [args.newMessage];
      if (ctxTokens.length >= 2)
        variants.push(`${args.newMessage} ${ctxTokens[0]} ${ctxTokens[1]}`);
      if (ctxTokens.length >= 4)
        variants.push(`${args.newMessage} ${ctxTokens[2]} ${ctxTokens[3]}`);
      const pool = Array.from(
        new Set(variants.map((q) => q.trim()).filter(Boolean)),
      );
      const selected = diversifyQueries(pool, args.newMessage);
      if (selected.length > 0) defaultPlan.queries = selected;
    } catch {}

    // If no API key present, skip LLM planning
    if (!process.env.OPENROUTER_API_KEY) {
      setCachedPlan(cacheKey, defaultPlan);
      // Metrics recorded at frontend layer
      return defaultPlan;
    }

    // Use LLM planning selectively for context-dependent queries
    // Balance between context understanding and performance
    const messageLC = args.newMessage.toLowerCase();
    const isFollowUp =
      messageLC.includes("what about") ||
      messageLC.includes("how about") ||
      messageLC.startsWith("and ") ||
      messageLC.match(/^(it|they|this|that|these|those)\s/);
    const shouldUseLLM =
      (jaccardScore >= 0.35 && jaccardScore <= 0.75) || isFollowUp;
    if (!shouldUseLLM) {
      // Even without LLM, enhance queries with context for better understanding
      // This helps with pronoun resolution and follow-up questions
      const enhancedDefaultPlan = { ...defaultPlan };

      const contextEntities = extractKeyEntities(contextSummary);
      if (contextEntities.length > 0 && defaultPlan.queries.length > 0) {
        // Add a variant that includes context entities for disambiguation
        const baseQuery = defaultPlan.queries[0];
        const contextualQuery = `${baseQuery} ${contextEntities.slice(0, 2).join(" ")}`;
        enhancedDefaultPlan.queries = [baseQuery, contextualQuery];
      }

      setCachedPlan(cacheKey, enhancedDefaultPlan, 3 * 60 * 1000);
      // Metrics recorded at frontend layer
      return enhancedDefaultPlan;
    }

    try {
      const prompt = {
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: SEARCH_PLANNER_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `Recent context (most recent last):\n${contextSummary}\n\nNew message: ${args.newMessage}\n\nReturn JSON only.`,
          },
        ],
        temperature: DEFAULT_TEMPERATURE,
        max_tokens: DEFAULT_MAX_TOKENS,
      } as const;

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(prompt),
        },
      );

      if (!response.ok) {
        setCachedPlan(cacheKey, defaultPlan);
        // Metrics recorded at frontend layer
        return defaultPlan;
      }
      const data = await response.json();
      const text: string = data?.choices?.[0]?.message?.content || "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Some models wrap JSON in code fences; try to extract
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      }

      const plan = parsed as any;
      if (
        plan?.shouldSearch !== undefined &&
        plan?.queries &&
        Array.isArray(plan.queries)
      ) {
        // Sanitize and diversify via MMR
        const baseList = Array.from(
          new Set(
            plan.queries
              .map((q: unknown) => serialize(String(q)))
              .filter((q: string) => q.length > 0)
              .slice(0, 6),
          ),
        );
        const queries = diversifyQueries(baseList as string[], args.newMessage);
        const finalPlan = {
          shouldSearch: Boolean(plan.shouldSearch),
          contextSummary: serialize(String(plan.contextSummary || "")).slice(
            0,
            2000,
          ),
          queries: queries.length > 0 ? queries : [args.newMessage],
          suggestNewChat: Boolean(plan.suggestNewChat),
          decisionConfidence: Math.max(
            0,
            Math.min(1, Number(plan.decisionConfidence) || 0.5),
          ),
          reasons: serialize(String(plan.reasons || "")).slice(0, 500),
        };
        setCachedPlan(cacheKey, finalPlan);
        // Metrics recorded at frontend layer
        return finalPlan;
      }
      setCachedPlan(cacheKey, defaultPlan);
      // Metrics recorded at frontend layer
      return defaultPlan;
    } catch {
      setCachedPlan(cacheKey, defaultPlan);
      // Metrics recorded at frontend layer
      return defaultPlan;
    }
  },
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

/** Record analytics metric */
export const recordMetric = internalMutation({
  args: {
    name: v.union(
      v.literal("planner_invoked"),
      v.literal("planner_rate_limited"),
      v.literal("user_overrode_prompt"),
      v.literal("new_chat_confirmed"),
    ),
    chatId: v.optional(v.id("chats")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const existing = await ctx.db
        .query("metrics")
        .withIndex("by_name_and_date", (q) =>
          q.eq("name", args.name).eq("date", date),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { count: (existing.count || 0) + 1 });
      } else {
        await ctx.db.insert("metrics", {
          name: args.name,
          date,
          chatId: args.chatId,
          count: 1,
        });
      }
    } catch (e) {
      console.warn("metrics failed", args.name, e);
    }
    return null;
  },
});

// Import and re-export client metrics
export { recordClientMetric } from "./search/metrics";

// Import scraping functionality
export { scrapeUrl } from "./search/scraper";
