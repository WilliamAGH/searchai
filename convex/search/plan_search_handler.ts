"use node";

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { getErrorMessage } from "../lib/errors";
import { buildContextSummary } from "../chats/utils";
import {
  SEARCH_PLANNER_SYSTEM_PROMPT,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from "./prompts";
import { applyEnhancements } from "../enhancements";
import { collectOpenRouterChatCompletionText } from "../lib/providers/openai_streaming";
import {
  extractKeyEntities,
  serialize,
  tokSet,
  jaccard,
  diversifyQueries,
} from "./utils";
import {
  type PlanResult,
  planCache,
  cleanupExpiredCache,
  checkRateLimit,
  recordRateLimitAttempt,
  getCachedPlan,
  setCachedPlan,
} from "./cache";

// Local view types for clarity
type ChatRole = "user" | "assistant" | "system";
interface ChatMessageView {
  role: ChatRole;
  content?: string;
  timestamp?: number;
}

interface LLMPlan {
  shouldSearch?: boolean;
  contextSummary?: string;
  queries?: string[];
  suggestNewChat?: boolean;
  decisionConfidence?: number;
  reasons?: string;
}

export async function runPlanSearch(
  ctx: ActionCtx,
  args: {
    chatId: Id<"chats">;
    newMessage: string;
    maxContextMessages?: number;
  },
) {
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
  // @ts-ignore - Known Convex TS2589 issue with complex type inference
  const recentMessages = await ctx.runQuery(
    // @ts-ignore - Known Convex TS2589 issue with complex type inference
    api.chats.messagesPaginated.getRecentChatMessages,
    {
      chatId: args.chatId,
      limit: 25,
    },
  );
  const messageCountKey = recentMessages.length;
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

  // Use the recent messages we already fetched above
  const messages = recentMessages;
  // Prefer server-stored rolling summary if present (reduces tokens)
  const chat = await ctx.runQuery(api.chats.getChatById, {
    chatId: args.chatId,
  });

  const recent: ChatMessageView[] = messages.slice(
    Math.max(0, messages.length - maxContext),
  );

  // Simple lexical overlap heuristic with the previous user message
  const newContent = serialize(args.newMessage);
  const prevUser =
    [...recent]
      .reverse()
      .find(
        (m: ChatMessageView) =>
          m.role === "user" && serialize(m.content || "") !== newContent,
      ) ||
    [...recent].reverse().find((m: ChatMessageView) => m.role === "user");
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
    messages: recent.map((m: ChatMessageView) => ({
      role: m.role,
      content: serialize(m.content),
      timestamp: m.timestamp,
    })),
    rollingSummary:
      chat && (chat as { rollingSummary?: string }).rollingSummary !== undefined
        ? (chat as { rollingSummary?: string }).rollingSummary
        : undefined,
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
  } catch (diversifyError) {
    console.warn("Query diversification failed:", {
      query: args.newMessage.substring(0, 100),
      error: getErrorMessage(diversifyError),
    });
    // Proceed with default queries
  }

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
    const enh = applyEnhancements(args.newMessage, {
      enhanceSystemPrompt: true,
    });
    const systemPrompt = enh.enhancedSystemPrompt
      ? `${SEARCH_PLANNER_SYSTEM_PROMPT}\n\n${enh.enhancedSystemPrompt}`
      : SEARCH_PLANNER_SYSTEM_PROMPT;

    const prompt = {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: `Recent context (most recent last):\n${contextSummary}\n\nNew message: ${args.newMessage}\n\nReturn JSON only.`,
        },
      ],
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: DEFAULT_MAX_TOKENS,
    };

    const { text } = await collectOpenRouterChatCompletionText(prompt);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (jsonError) {
      // Some models wrap JSON in code fences; try to extract
      console.warn("LLM response JSON parse failed, trying regex extraction:", {
        responseLength: text.length,
        error: getErrorMessage(jsonError),
      });
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    const plan = parsed as Partial<LLMPlan> | null;
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
  } catch (llmError) {
    console.warn("LLM planning call failed:", {
      chatId: args.chatId,
      query: args.newMessage.substring(0, 100),
      error: getErrorMessage(llmError),
    });
    setCachedPlan(cacheKey, defaultPlan);
    // Metrics recorded at frontend layer
    return defaultPlan;
  }
}
