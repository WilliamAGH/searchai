"use node";

/**
 * Helper functions for search planning
 * Extracted from plan_search_handler.ts for modularity
 */

import type { PlanResult } from "./cache";
import { setCachedPlan } from "./cache";
import {
  extractKeyEntities,
  serialize,
  tokSet,
  jaccard,
  diversifyQueries,
} from "./utils";
import { getErrorMessage } from "../lib/errors";
import { buildContextSummary } from "../chats/utils";

// Local view types for clarity
type ChatRole = "user" | "assistant" | "system";
export interface ChatMessageView {
  role: ChatRole;
  content?: string;
  timestamp?: number;
  _creationTime?: number;
}

/** Build an empty plan for short-circuit cases */
export function buildEmptyPlan(): PlanResult {
  return {
    shouldSearch: false,
    contextSummary: "",
    queries: [],
    suggestNewChat: false,
    decisionConfidence: 0.9,
    reasons: "empty_input",
  };
}

/** Build a rate-limited fallback plan */
export function buildRateLimitedPlan(newMessage: string): PlanResult {
  return {
    shouldSearch: true,
    contextSummary: "",
    queries: [newMessage],
    suggestNewChat: false,
    decisionConfidence: 0.5,
    reasons: "rate_limited",
  };
}

/** Compute jaccard score and time-based heuristics */
export function computeHeuristics(
  newMessage: string,
  recentMessages: ChatMessageView[],
): { jaccardScore: number; minutesGap: number; timeSuggestNew: boolean } {
  const newContent = serialize(newMessage);
  const prevUser =
    [...recentMessages]
      .reverse()
      .find(
        (m: ChatMessageView) =>
          m.role === "user" && serialize(m.content || "") !== newContent,
      ) ||
    [...recentMessages]
      .reverse()
      .find((m: ChatMessageView) => m.role === "user");

  const jaccardScore = jaccard(
    tokSet(serialize(prevUser?.content)),
    tokSet(newContent),
  );
  const lastTs = prevUser?.timestamp as number | undefined;
  const minutesGap = lastTs ? Math.floor((Date.now() - lastTs) / 60000) : 0;
  const timeSuggestNew = minutesGap >= 120;

  return { jaccardScore, minutesGap, timeSuggestNew };
}

/** Build context summary from messages */
export function buildPlanContextSummary(
  recentMessages: ChatMessageView[],
  rollingSummary: string | undefined,
): string {
  return buildContextSummary({
    messages: recentMessages.map((m: ChatMessageView) => ({
      role: m.role,
      content: serialize(m.content),
      timestamp: m.timestamp,
    })),
    rollingSummary,
    maxChars: 1600,
  });
}

/** Build default plan with heuristics */
export function buildDefaultPlan(
  newMessage: string,
  contextSummary: string,
  jaccardScore: number,
  minutesGap: number,
  timeSuggestNew: boolean,
): PlanResult {
  const defaultPlan: PlanResult = {
    shouldSearch: true,
    contextSummary,
    queries: [newMessage],
    suggestNewChat: timeSuggestNew ? true : jaccardScore < 0.5,
    decisionConfidence: timeSuggestNew ? 0.85 : 0.65,
    reasons: `jaccard=${jaccardScore.toFixed(2)} gapMin=${minutesGap}`,
  };

  // Diversify queries (MMR) from simple context-derived variants
  try {
    const ctxTokens = Array.from(tokSet(contextSummary))
      .filter((t) => t.length > 3)
      .slice(0, 10);
    const variants: string[] = [newMessage];
    if (ctxTokens.length >= 2)
      variants.push(`${newMessage} ${ctxTokens[0]} ${ctxTokens[1]}`);
    if (ctxTokens.length >= 4)
      variants.push(`${newMessage} ${ctxTokens[2]} ${ctxTokens[3]}`);
    const pool = Array.from(
      new Set(variants.map((q) => q.trim()).filter(Boolean)),
    );
    const selected = diversifyQueries(pool, newMessage);
    if (selected.length > 0) defaultPlan.queries = selected;
  } catch (diversifyError) {
    console.warn("Query diversification failed:", {
      query: newMessage.substring(0, 100),
      error: getErrorMessage(diversifyError),
    });
  }

  return defaultPlan;
}

/** Enhance default plan with context entities when not using LLM */
export function enhanceDefaultPlanWithContext(
  defaultPlan: PlanResult,
  contextSummary: string,
  cacheKey: string,
): PlanResult {
  const enhancedPlan = { ...defaultPlan };
  const contextEntities = extractKeyEntities(contextSummary);

  if (contextEntities.length > 0 && defaultPlan.queries.length > 0) {
    const baseQuery = defaultPlan.queries[0];
    const contextualQuery = `${baseQuery} ${contextEntities.slice(0, 2).join(" ")}`;
    enhancedPlan.queries = [baseQuery, contextualQuery];
  }

  setCachedPlan(cacheKey, enhancedPlan, 3 * 60 * 1000);
  return enhancedPlan;
}

/** Check if message is a follow-up based on linguistic patterns */
export function isFollowUpMessage(message: string): boolean {
  const messageLC = message.toLowerCase();
  return (
    messageLC.includes("what about") ||
    messageLC.includes("how about") ||
    messageLC.startsWith("and ") ||
    !!messageLC.match(/^(it|they|this|that|these|those)\s/)
  );
}

/** Determine if LLM planning should be used */
export function shouldUseLLMPlanning(
  jaccardScore: number,
  newMessage: string,
): boolean {
  const isFollowUp = isFollowUpMessage(newMessage);
  return (jaccardScore >= 0.35 && jaccardScore <= 0.75) || isFollowUp;
}
