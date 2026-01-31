"use node";

/**
 * Search planning handler
 * Determines search strategy based on conversation context and heuristics.
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { getErrorMessage } from "../lib/errors";
import {
  SEARCH_PLANNER_SYSTEM_PROMPT,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from "./prompts";
import { applyEnhancements } from "../enhancements";
import { collectOpenRouterChatCompletionText } from "../lib/providers/openai_streaming";
import { serialize, diversifyQueries } from "./utils";
import {
  type PlanResult,
  planCache,
  cleanupExpiredCache,
  checkRateLimit,
  recordRateLimitAttempt,
  getCachedPlan,
  setCachedPlan,
} from "./cache";
import { safeParseWithLog } from "../lib/validation/zodUtils";
import { LLMPlanSchema } from "../schemas/planner";
import type { LLMPlan } from "../schemas/planner";
import {
  type ChatMessageView,
  buildEmptyPlan,
  buildRateLimitedPlan,
  computeHeuristics,
  buildPlanContextSummary,
  buildDefaultPlan,
  enhanceDefaultPlanWithContext,
  shouldUseLLMPlanning,
} from "./plan_search_helpers";

/** Build cache key from chat context */
function buildCacheKey(
  chatId: Id<"chats">,
  normMsg: string,
  messageCount: number,
  lastCreationTime: number,
): string {
  return `${chatId}|${normMsg}|${messageCount}|${lastCreationTime}`;
}

/** Parse and validate LLM response */
function parseLLMResponse(
  text: string,
  chatId: Id<"chats">,
  newMessage: string,
): LLMPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (jsonError) {
    console.warn("LLM response JSON parse failed, trying regex extraction:", {
      responseLength: text.length,
      error: getErrorMessage(jsonError),
    });
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  }

  const planResult = safeParseWithLog(
    LLMPlanSchema,
    parsed,
    `LLMPlan [chatId=${chatId}, msg=${newMessage.substring(0, 30)}]`,
  );

  if (!planResult.success) {
    throw new Error(
      `LLM plan validation failed for chatId=${chatId}: ${planResult.error.message}`,
    );
  }

  return planResult.data;
}

/** Build final plan from validated LLM response */
function buildFinalPlanFromLLM(
  plan: LLMPlan,
  newMessage: string,
): PlanResult | null {
  if (
    plan.shouldSearch === undefined ||
    !plan.queries ||
    !Array.isArray(plan.queries)
  ) {
    return null;
  }

  const baseList = Array.from(
    new Set(
      plan.queries
        .map((q: unknown) => serialize(String(q)))
        .filter((q: string) => q.length > 0)
        .slice(0, 6),
    ),
  );
  const queries = diversifyQueries(baseList as string[], newMessage);

  return {
    shouldSearch: Boolean(plan.shouldSearch),
    contextSummary: serialize(String(plan.contextSummary || "")).slice(0, 2000),
    queries: queries.length > 0 ? queries : [newMessage],
    suggestNewChat: Boolean(plan.suggestNewChat),
    decisionConfidence: Math.max(
      0,
      Math.min(1, Number(plan.decisionConfidence) || 0.5),
    ),
    reasons: serialize(String(plan.reasons || "")).slice(0, 500),
  };
}

export async function runPlanSearch(
  ctx: ActionCtx,
  args: {
    chatId: Id<"chats">;
    newMessage: string;
    sessionId?: string;
    maxContextMessages?: number;
  },
) {
  const now = Date.now();

  // Short-circuit on empty input
  if (args.newMessage.trim().length === 0) {
    const emptyPlan = buildEmptyPlan();
    setCachedPlan(`${args.chatId}|`, emptyPlan);
    return emptyPlan;
  }

  cleanupExpiredCache(planCache, now);

  // Fetch recent messages for cache key and context
  const normMsg = args.newMessage.toLowerCase().trim().slice(0, 200);
  // @ts-ignore - Known Convex TS2589 issue
  const recentMessages = await ctx.runQuery(
    // @ts-ignore - Known Convex TS2589 issue
    api.chats.messagesPaginated.getRecentChatMessages,
    { chatId: args.chatId, sessionId: args.sessionId, limit: 25 },
  );

  let lastCreationTime = 0;
  for (const msg of recentMessages) {
    lastCreationTime = Math.max(lastCreationTime, msg._creationTime ?? 0);
  }

  const cacheKey = buildCacheKey(
    args.chatId,
    normMsg,
    recentMessages.length,
    lastCreationTime,
  );

  // Check cache first
  const cachedPlan = getCachedPlan(cacheKey, now);
  if (cachedPlan) return cachedPlan;

  // Rate limit check
  const { isLimited } = checkRateLimit(args.chatId, now);
  if (isLimited) {
    const fallback = buildRateLimitedPlan(args.newMessage);
    setCachedPlan(cacheKey, fallback);
    return fallback;
  }
  recordRateLimitAttempt(args.chatId, now);

  // Build context
  const maxContext = Math.max(1, Math.min(args.maxContextMessages ?? 10, 25));
  const recent: ChatMessageView[] = recentMessages.slice(
    Math.max(0, recentMessages.length - maxContext),
  );

  const chat = await ctx.runQuery(api.chats.getChatById, {
    chatId: args.chatId,
  });
  const rollingSummary =
    chat && (chat as { rollingSummary?: string }).rollingSummary !== undefined
      ? (chat as { rollingSummary?: string }).rollingSummary
      : undefined;

  const contextSummary = buildPlanContextSummary(recent, rollingSummary);
  const { jaccardScore, minutesGap, timeSuggestNew } = computeHeuristics(
    args.newMessage,
    recent,
  );

  const defaultPlan = buildDefaultPlan(
    args.newMessage,
    contextSummary,
    jaccardScore,
    minutesGap,
    timeSuggestNew,
  );

  // Skip LLM if no API key
  if (!process.env.OPENROUTER_API_KEY) {
    setCachedPlan(cacheKey, defaultPlan);
    return defaultPlan;
  }

  // Decide whether to use LLM
  if (!shouldUseLLMPlanning(jaccardScore, args.newMessage)) {
    return enhanceDefaultPlanWithContext(defaultPlan, contextSummary, cacheKey);
  }

  // Use LLM planning
  try {
    const { text } = await collectOpenRouterChatCompletionText({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system" as const,
          content: applyEnhancements(args.newMessage, {
            enhanceSystemPrompt: true,
          }).enhancedSystemPrompt
            ? `${SEARCH_PLANNER_SYSTEM_PROMPT}\n\n${applyEnhancements(args.newMessage, { enhanceSystemPrompt: true }).enhancedSystemPrompt}`
            : SEARCH_PLANNER_SYSTEM_PROMPT,
        },
        {
          role: "user" as const,
          content: `Recent context (most recent last):\n${contextSummary}\n\nNew message: ${args.newMessage}\n\nReturn JSON only.`,
        },
      ],
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: DEFAULT_MAX_TOKENS,
    });

    const plan = parseLLMResponse(text, args.chatId, args.newMessage);
    if (plan && plan.shouldSearch !== undefined && plan.queries) {
      const finalPlan = buildFinalPlanFromLLM(plan, args.newMessage);
      if (finalPlan) {
        setCachedPlan(cacheKey, finalPlan);
        return finalPlan;
      }
    }

    setCachedPlan(cacheKey, defaultPlan);
    return defaultPlan;
  } catch (llmError) {
    console.warn("LLM planning call failed:", {
      chatId: args.chatId,
      query: args.newMessage.substring(0, 100),
      error: getErrorMessage(llmError),
    });
    setCachedPlan(cacheKey, defaultPlan);
    return defaultPlan;
  }
}
