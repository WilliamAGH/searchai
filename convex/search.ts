// Note: This file runs in the default V8 runtime. Avoid Node-only APIs here.
/**
 * Search functions
 * - Public web search providers (SERP, OpenRouter, DuckDuckGo)
 * - Planner: summarize recent chat, emit focused queries
 * - Ephemeral cache (in-process) for plan decisions (per chat+message)
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";

// Tunables (override via env)
// Reserved for future keyword-based planning enhancements
// const _MAX_KWS = Math.max(1, Math.min(parseInt(process.env.PLANNER_MAX_KWS || "6", 10) || 6, 12));
// const _MAX_EXTRAS = Math.max(1, Math.min(parseInt(process.env.PLANNER_MAX_EXTRAS || "4", 10) || 4, 8));
import { buildContextSummary } from "./chats";

// Test-only helpers (no production references). Kept minimal and standalone.
function __testTokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
function __testSerialize(s?: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}
export function __extractKeywordsForTest(text: string, max: number): string[] {
  const freq = new Map<string, number>();
  for (const tok of __testTokenize(text)) {
    if (tok.length < 4) continue;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }
  const limit = Math.max(1, max | 0);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}
export function __augmentQueryForTest(
  q: string,
  kws: string[],
  maxExtras: number,
): string {
  const base = __testSerialize(q);
  const words = new Set(__testTokenize(base));
  const extras: string[] = [];
  const cap = Math.max(1, maxExtras | 0);
  for (const k of kws || []) {
    if (!words.has(k) && extras.length < cap) extras.push(k);
  }
  const combined = extras.length ? `${base} ${extras.join(" ")}` : base;
  return combined.slice(0, 220);
}

// Ephemeral in-process cache for planner decisions (best-effort only)
type PlanResult = {
  shouldSearch: boolean;
  contextSummary: string;
  queries: string[];
  suggestNewChat: boolean;
  decisionConfidence: number;
  reasons: string;
};
const planCache: Map<string, { expires: number; result: PlanResult }> =
  new Map();
// Rate limiting + cache constants
const PLAN_RATE_LIMIT = 6;
const PLAN_RATE_WINDOW_MS = 60_000; // 60s
const PLAN_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
// Simple per-chat leaky bucket limiter
const planRate: Map<string, number[]> = new Map();

/**
 * Perform a best-effort web search using available providers.
 * Order of attempts:
 * 1) SERP API (Google via SerpAPI) if SERP_API_KEY is set
 * 2) OpenRouter web-search capable model if OPENROUTER_API_KEY is set
 * 3) DuckDuckGo JSON API as a backup
 * 4) Minimal fallback links
 *
 * Args:
 * - query: The user query string
 * - maxResults: Optional maximum number of results to return (default 5)
 *
 * Returns: { results, searchMethod, hasRealResults }
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
    if (args.query.trim().length === 0) {
      return {
        results: [],
        searchMethod: "fallback" as const,
        hasRealResults: false,
      };
    }

    // Try SERP API for DuckDuckGo first if available
    if (process.env.SERP_API_KEY) {
      try {
        const serpResults = await searchWithSerpApiDuckDuckGo(
          args.query,
          maxResults,
        );
        if (serpResults.length > 0) {
          return {
            results: serpResults,
            searchMethod: "serp" as const,
            hasRealResults: true,
          };
        }
      } catch (error) {
        console.warn(
          "SERP API (DuckDuckGo) failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    } else {
      console.log("SERP API key not available, skipping SERP search");
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
        console.warn(
          "OpenRouter search failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    } else {
      console.log(
        "OpenRouter API key not available, skipping OpenRouter search",
      );
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
      console.warn(
        "DuckDuckGo search failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
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
 * Plan a context-aware web search.
 * - Summarizes recent chat context
 * - Optionally calls an LLM to propose focused search queries
 * - Falls back to a single-query plan using the user's message
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
      planCache.set(cacheKey, {
        expires: now + PLAN_CACHE_TTL_MS,
        result: emptyPlan,
      });
      // Best-effort metric
      const _metricEmpty: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_invoked", chatId: args.chatId },
      );
      void _metricEmpty;
      return emptyPlan;
    }
    // Clean up expired cache entries (best-effort)
    for (const [k, v] of planCache) {
      if (v.expires <= now) planCache.delete(k);
    }
    // Cache key: chat + normalized message (first 200 chars)
    const normMsg = args.newMessage.toLowerCase().trim().slice(0, 200);
    // Strengthen cache key with message count to avoid over-hit on same prefix
    const messageCountKey = (
      await ctx.runQuery(api.chats.getChatMessages, { chatId: args.chatId })
    ).length;
    const cacheKey = `${args.chatId}|${normMsg}|${messageCountKey}`;
    // Rate limit: retain timestamps within last 60s
    const bucket = planRate.get(String(args.chatId)) || [];
    const windowStart = now - PLAN_RATE_WINDOW_MS;
    const pruned = bucket.filter((t) => t >= windowStart);
    if (pruned.length >= PLAN_RATE_LIMIT) {
      // Too many plan calls; serve default plan (also cached)
      const fallback = {
        shouldSearch: true,
        contextSummary: "",
        queries: [args.newMessage],
        suggestNewChat: false,
        decisionConfidence: 0.5,
        reasons: "rate_limited",
      } as PlanResult;
      planCache.set(cacheKey, {
        expires: now + PLAN_CACHE_TTL_MS,
        result: fallback,
      });
      // telemetry
      const _metricRateLimited: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_rate_limited", chatId: args.chatId },
      );
      return fallback;
    }
    // Record this attempt in the rate bucket
    pruned.push(now);
    planRate.set(String(args.chatId), pruned);
    const hit = planCache.get(cacheKey);
    if (hit && hit.expires > now) {
      const _metricCacheHit: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_invoked", chatId: args.chatId },
      );
      return hit.result;
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
    const serialize = (s: string | undefined) =>
      (s || "").replace(/\s+/g, " ").trim();
    const tokenize = (t: string) =>
      t
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    const tokSet = (s: string) => new Set(tokenize(s));
    const jacc = (A: Set<string>, B: Set<string>) => {
      const inter = new Set([...A].filter((x) => B.has(x))).size;
      const uni = new Set([...A, ...B]).size || 1;
      return inter / uni;
    };
    /* const _STOP = new Set([
      'the','a','an','and','or','of','to','in','for','on','with','at','by','from','as','is','are','was','were','be','been','being','that','this','these','those','it','its','if','then','else','but','about','into','over','after','before','up','down','out','off','than','so','such','via'
    ]); */
    // (test helpers exported at top-level)

    // Simple lexical overlap heuristic with the previous user message (exclude the immediate new message text)
    const newContent = serialize(args.newMessage);
    const prevUser: any | undefined =
      [...recent]
        .reverse()
        .find(
          (m: any) => m.role === "user" && serialize(m.content) !== newContent,
        ) || [...recent].reverse().find((m: any) => m.role === "user");
    const lastContent = serialize(prevUser?.content);
    const a = tokSet(lastContent);
    const b = tokSet(newContent);
    const jaccard = jacc(a, b);

    // Time-based heuristic
    const lastTs: number | undefined =
      typeof prevUser?.timestamp === "number" ? prevUser.timestamp : undefined;
    const minutesGap: number = lastTs
      ? Math.floor((Date.now() - lastTs) / 60000)
      : 0;
    const timeSuggestNew: boolean = minutesGap >= 120;

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
      suggestNewChat: timeSuggestNew ? true : jaccard < 0.5,
      decisionConfidence: timeSuggestNew ? 0.85 : 0.65,
      reasons: `jaccard=${jaccard.toFixed(2)} gapMin=${minutesGap}`,
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
      const Q = tokSet(args.newMessage);
      const pool = Array.from(
        new Set(variants.map((q) => q.trim()).filter(Boolean)),
      );
      const selected: string[] = [];
      const used = new Set<number>();
      const lambda = 0.7;
      while (selected.length < Math.min(4, pool.length)) {
        let bestIdx = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < pool.length; i++) {
          if (used.has(i)) continue;
          const cand = pool[i];
          const C = tokSet(cand);
          const rel = jacc(C, Q);
          let nov = 1;
          for (const s of selected) nov = Math.min(nov, 1 - jacc(C, tokSet(s)));
          const score = lambda * rel + (1 - lambda) * nov;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) break;
        used.add(bestIdx);
        selected.push(pool[bestIdx]);
      }
      if (selected.length > 0) defaultPlan.queries = selected;
    } catch {}

    // If no API key present, skip LLM planning
    if (!process.env.OPENROUTER_API_KEY) {
      planCache.set(cacheKey, {
        expires: now + PLAN_CACHE_TTL_MS,
        result: defaultPlan,
      });
      const _metricNoApiKey: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_invoked", chatId: args.chatId },
      );
      return defaultPlan;
    }

    // Only call LLM if the topic boundary is ambiguous; otherwise save tokens
    const borderline = jaccard >= 0.45 && jaccard <= 0.7;
    if (!borderline) {
      planCache.set(cacheKey, {
        expires: now + 3 * 60 * 1000,
        result: defaultPlan,
      });
      const _metricNotBorderline: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_invoked", chatId: args.chatId },
      );
      return defaultPlan;
    }

    try {
      const prompt = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You plan web searches for a conversational assistant. Return strict JSON only with fields: shouldSearch:boolean, contextSummary:string(<=500 tokens), queries:string[], suggestNewChat:boolean, decisionConfidence:number (0-1), reasons:string. Each query MUST include the core terms from the new message and SHOULD include salient context keywords/entities when helpful. Keep queries de-duplicated, concrete, and specific.",
          },
          {
            role: "user",
            content: `Recent context (most recent last):\n${contextSummary}\n\nNew message: ${args.newMessage}\n\nReturn JSON only.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
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
        planCache.set(cacheKey, {
          expires: now + PLAN_CACHE_TTL_MS,
          result: defaultPlan,
        });
        const _metricBadResponse: null = await ctx.runMutation(
          internal.search.recordMetric,
          { name: "planner_invoked", chatId: args.chatId },
        );
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

      if (
        parsed &&
        typeof (parsed as any).shouldSearch === "boolean" &&
        typeof (parsed as any).contextSummary === "string" &&
        Array.isArray((parsed as any).queries) &&
        typeof (parsed as any).suggestNewChat === "boolean" &&
        typeof (parsed as any).decisionConfidence === "number" &&
        typeof (parsed as any).reasons === "string"
      ) {
        const plan = parsed as {
          shouldSearch: boolean;
          contextSummary: string;
          queries: string[];
          suggestNewChat: boolean;
          decisionConfidence: number;
          reasons: string;
        };
        // Sanitize and diversify via MMR
        const baseList = Array.from(
          new Set(
            plan.queries
              .map((q) => serialize(q))
              .filter((q) => q.length > 0)
              .slice(0, 6),
          ),
        );
        const Q = tokSet(args.newMessage);
        const pool = baseList;
        const selected: string[] = [];
        const used = new Set<number>();
        const lambda = 0.7;
        while (selected.length < Math.min(4, pool.length)) {
          let bestIdx = -1;
          let bestScore = -Infinity;
          for (let i = 0; i < pool.length; i++) {
            if (used.has(i)) continue;
            const cand = pool[i];
            const C = tokSet(cand);
            const rel = jacc(C, Q);
            let nov = 1;
            for (const s of selected)
              nov = Math.min(nov, 1 - jacc(C, tokSet(s)));
            const score = lambda * rel + (1 - lambda) * nov;
            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }
          if (bestIdx === -1) break;
          used.add(bestIdx);
          selected.push(pool[bestIdx]);
        }
        const queries = selected;
        const finalPlan = {
          shouldSearch: plan.shouldSearch,
          contextSummary: serialize(plan.contextSummary).slice(0, 2000),
          queries: queries.length > 0 ? queries : [args.newMessage],
          suggestNewChat: plan.suggestNewChat,
          decisionConfidence: Math.max(0, Math.min(1, plan.decisionConfidence)),
          reasons: serialize(plan.reasons).slice(0, 500),
        };
        planCache.set(cacheKey, {
          expires: now + PLAN_CACHE_TTL_MS,
          result: finalPlan,
        });
        const _metricPlanned: null = await ctx.runMutation(
          internal.search.recordMetric,
          { name: "planner_invoked", chatId: args.chatId },
        );
        return finalPlan;
      }
      planCache.set(cacheKey, {
        expires: now + PLAN_CACHE_TTL_MS,
        result: defaultPlan,
      });
      const _metricParseFail: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_invoked", chatId: args.chatId },
      );
      return defaultPlan;
    } catch {
      planCache.set(cacheKey, {
        expires: now + PLAN_CACHE_TTL_MS,
        result: defaultPlan,
      });
      const _metricException: null = await ctx.runMutation(
        internal.search.recordMetric,
        { name: "planner_invoked", chatId: args.chatId },
      );
      return defaultPlan;
    }
  },
});

/**
 * Invalidate in-process planner cache entries for a given chat
 * - Clears keys with the `${chatId}|*` prefix from planCache
 * - Internal action so it can be scheduled from mutations
 */
export const invalidatePlanCacheForChat = internalAction({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const prefix = `${args.chatId}|`;
    for (const key of Array.from(planCache.keys())) {
      if (key.startsWith(prefix)) planCache.delete(key);
    }
    return null;
  },
});

/**
 * Record metric for analytics
 * - Daily aggregation by name
 * - Increments counter
 * - Best-effort (fails silently)
 * @param ctx - Context with database
 * @param name - Metric name
 * @param chatId - Optional chat ID
 */
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

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}

interface SerpApiResponse {
  organic_results?: Array<{
    title?: string;
    link: string;
    snippet?: string;
    displayed_link?: string;
  }>;
}

/**
 * Query SerpAPI (Google engine)
 * - Fetches organic results
 * - Returns normalized SearchResult[]
 * - Detailed error logging
 * - Relevance score: 0.9
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithSerpApiDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const apiUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}&hl=en&gl=us&num=${maxResults}`;
  console.log("🔍 SERP API Request:", {
    query,
    maxResults,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "SearchChat/1.0 (Web Search Assistant)",
      },
    });

    console.log("📊 SERP API Response:", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: apiUrl,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `SERP API returned ${response.status} ${response.statusText}: ${errorText}`;
      console.error("❌ SERP API Error Details:", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
        query: query,
        maxResults: maxResults,
        timestamp: new Date().toISOString(),
      });
      throw new Error(errorMessage);
    }

    const data: SerpApiResponse = await response.json();
    console.log("✅ SERP API Success:", {
      hasOrganic: !!data.organic_results,
      count: data.organic_results?.length || 0,
      query: query,
      timestamp: new Date().toISOString(),
    });

    if (data.organic_results && data.organic_results.length > 0) {
      const results: SearchResult[] = data.organic_results
        .slice(0, maxResults)
        .map((result) => ({
          title: result.title || "Untitled",
          url: result.link,
          snippet: result.snippet || result.displayed_link || "",
          relevanceScore: 0.9,
        }));

      console.log("📋 SERP API Results Parsed:", {
        resultCount: results.length,
        sampleResults: results.slice(0, 2).map((r) => ({
          title: r.title,
          url: r.url,
          snippetLength: r.snippet?.length || 0,
        })),
        timestamp: new Date().toISOString(),
      });

      return results;
    }

    console.log("⚠️ SERP API No Results:", {
      query,
      timestamp: new Date().toISOString(),
    });
    return [];
  } catch (error) {
    console.error("💥 SERP API Exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      query: query,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type: string;
        url_citation?: {
          title?: string;
          url: string;
          content?: string;
          start_index?: number;
          end_index?: number;
        };
      }>;
    };
  }>;
}

/**
 * Search via OpenRouter model
 * - Uses Perplexity Sonar model
 * - Extracts URLs from annotations
 * - Falls back to regex extraction
 * - Relevance score: 0.75-0.85
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithOpenRouter(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content:
              "You are a web search assistant. Provide factual information with sources. Always cite your sources with URLs.",
          },
          {
            role: "user",
            content: `Search for: ${query}. Provide key information with source URLs.`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const data: OpenRouterResponse = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const annotations = data.choices?.[0]?.message?.annotations || [];

  // Extract URLs from annotations if available
  const results: SearchResult[] = [];

  if (annotations.length > 0) {
    annotations.forEach((annotation, index) => {
      if (annotation.type === "url_citation" && annotation.url_citation) {
        const citation = annotation.url_citation;
        results.push({
          title: citation.title || `Search Result ${index + 1}`,
          url: citation.url,
          snippet:
            citation.content ||
            content.substring(
              citation.start_index || 0,
              citation.end_index || 200,
            ),
          relevanceScore: 0.85,
        });
      }
    });
  }

  // If no annotations, try to extract URLs from content
  if (results.length === 0 && content) {
    const urlRegex = /https?:\/\/[^\s)]+/g;
    const urls = content.match(urlRegex) || [];

    urls.slice(0, maxResults).forEach((url: string, index: number) => {
      results.push({
        title: `Search Result ${index + 1} for: ${query}`,
        url: url,
        snippet: `${content.substring(0, 200)}...`,
        relevanceScore: 0.75,
      });
    });
  }

  return results.slice(0, maxResults);
}

interface DuckDuckGoResponse {
  RelatedTopics?: Array<{
    FirstURL?: string;
    Text?: string;
  }>;
  Abstract?: string;
  AbstractURL?: string;
  Heading?: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}

/**
 * Search via DuckDuckGo API
 * - Uses instant answer API
 * - Extracts RelatedTopics/Abstract
 * - Fallback to Wikipedia/DDG links
 * - Relevance score: 0.4-0.8
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "SearchChat/1.0 (Web Search Assistant)",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo API returned ${response.status}`);
  }

  const data: DuckDuckGoResponse = await response.json();
  let results: SearchResult[] = [];

  // Extract results from DuckDuckGo response
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    results = data.RelatedTopics.filter(
      (topic) =>
        topic.FirstURL && topic.Text && topic.FirstURL.startsWith("http"),
    )
      .slice(0, maxResults)
      .map((topic) => ({
        title:
          topic.Text?.split(" - ")[0] ||
          topic.Text?.substring(0, 100) ||
          "Untitled",
        url: topic.FirstURL || "",
        snippet: topic.Text || "",
        relevanceScore: 0.7,
      }));
  }

  // If no results from RelatedTopics, try Abstract
  if (results.length === 0 && data.Abstract && data.AbstractURL) {
    results = [
      {
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.Abstract,
        relevanceScore: 0.8,
      },
    ];
  }

  // Enhanced fallback with better search URLs
  if (results.length === 0) {
    const fallbackSources: SearchResult[] = [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(query)}`,
        snippet: `Wikipedia search results for "${query}"`,
        relevanceScore: 0.6,
      },
      {
        title: `${query} - Search Results`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: `Web search results for "${query}"`,
        relevanceScore: 0.4,
      },
    ];

    results = fallbackSources.slice(0, Math.min(2, maxResults));
  }

  return results;
}

/**
 * Scrape and clean web page content
 * - Extracts title from <title> or <h1>
 * - Removes scripts/styles/HTML
 * - Filters junk patterns
 * - Truncates to 5000 chars
 * - 10s timeout
 * @param url - Absolute URL to fetch
 * @returns {title, content, summary}
 */
export const scrapeUrl = action({
  args: { url: v.string() },
  returns: v.object({
    title: v.string(),
    content: v.string(),
    summary: v.optional(v.string()),
  }),
  handler: async (
    _,
    args,
  ): Promise<{
    title: string;
    content: string;
    summary?: string;
  }> => {
    // Short-TTL in-process cache to avoid repeat scrapes across adjacent queries
    const SCRAPE_TTL_MS = 2 * 60 * 1000; // 2 minutes
    const globalAny: any = globalThis as any;
    if (!globalAny.__scrapeCache)
      globalAny.__scrapeCache = new Map<
        string,
        {
          exp: number;
          val: { title: string; content: string; summary?: string };
        }
      >();
    const cache: Map<
      string,
      { exp: number; val: { title: string; content: string; summary?: string } }
    > = globalAny.__scrapeCache;
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.exp <= now) cache.delete(k);
    }
    const hit = cache.get(args.url);
    if (hit && hit.exp > now) {
      return hit.val;
    }
    console.log("🌐 Scraping URL initiated:", {
      url: args.url,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await fetch(args.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SearchChat/1.0; Web Content Reader)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      console.log("📊 Scrape response received:", {
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorDetails = {
          url: args.url,
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        };
        console.error("❌ HTTP error during scraping:", errorDetails);
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      console.log("📄 Content type check:", {
        url: args.url,
        contentType: contentType,
      });

      if (!contentType.includes("text/html")) {
        const errorDetails = {
          url: args.url,
          contentType: contentType,
          timestamp: new Date().toISOString(),
        };
        console.error("❌ Non-HTML content type:", errorDetails);
        throw new Error(`Not an HTML page. Content-Type: ${contentType}`);
      }

      const html = await response.text();
      console.log("✅ HTML content fetched:", {
        url: args.url,
        contentLength: html.length,
        timestamp: new Date().toISOString(),
      });

      // Extract title using regex
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      let title = titleMatch ? titleMatch[1].trim() : "";

      // Try h1 if no title
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (!title) {
        title = h1Match ? h1Match[1].trim() : new URL(args.url).hostname;
      }

      console.log("🏷️ Title extracted:", {
        url: args.url,
        title: title,
        method: titleMatch ? "title tag" : h1Match ? "h1 tag" : "hostname",
      });

      // Remove script and style tags, then extract text content
      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      console.log("🧹 Content cleaned:", {
        url: args.url,
        originalLength: html.length,
        cleanedLength: content.length,
      });

      // Filter out low-quality content
      if (content.length < 100) {
        const errorDetails = {
          url: args.url,
          contentLength: content.length,
          timestamp: new Date().toISOString(),
        };
        console.error("❌ Content too short after cleaning:", errorDetails);
        throw new Error(`Content too short (${content.length} characters)`);
      }

      // Remove common junk patterns
      const junkPatterns = [
        /cookie policy/gi,
        /accept cookies/gi,
        /privacy policy/gi,
        /terms of service/gi,
        /subscribe to newsletter/gi,
        /follow us on/gi,
        /share this article/gi,
      ];

      let removedJunkCount = 0;
      for (const pattern of junkPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          removedJunkCount += matches.length;
        }
        content = content.replace(pattern, "");
      }

      console.log("🗑️ Junk content removed:", {
        url: args.url,
        removedCount: removedJunkCount,
      });

      // Limit content length
      if (content.length > 5000) {
        content = `${content.substring(0, 5000)}...`;
        console.log("✂️ Content truncated:", {
          url: args.url,
          newLength: content.length,
        });
      }

      // Generate summary (first few sentences)
      const summaryLength = Math.min(500, content.length);
      const summary =
        content.substring(0, summaryLength) +
        (content.length > summaryLength ? "..." : "");

      const result = { title, content, summary };
      cache.set(args.url, { exp: Date.now() + SCRAPE_TTL_MS, val: result });
      console.log("✅ Scraping completed successfully:", {
        url: args.url,
        resultLength: content.length,
        summaryLength: summary.length,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      console.error("💥 Scraping failed with exception:", {
        url: args.url,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : "No stack trace",
        timestamp: new Date().toISOString(),
      });

      let hostname = "";
      try {
        hostname = new URL(args.url).hostname;
      } catch {
        hostname = "unknown";
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      const val = {
        title: hostname,
        content: `Unable to fetch content from ${args.url}: ${errorMessage}`,
        summary: `Content unavailable from ${hostname}`,
      };
      cache.set(args.url, { exp: Date.now() + SCRAPE_TTL_MS, val });
      return val;
    }
  },
});

/**
 * Record client-side metric
 * - Supports: user_overrode_prompt, new_chat_confirmed
 * - Optional chatId for attribution
 */
export const recordClientMetric = action({
  args: {
    name: v.union(
      v.literal("user_overrode_prompt"),
      v.literal("new_chat_confirmed"),
    ),
    chatId: v.optional(v.id("chats")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const _metricClient: null = await ctx.runMutation(
      internal.search.recordMetric,
      { name: args.name, chatId: args.chatId },
    );
    return null;
  },
});
