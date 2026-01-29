/**
 * Search planning functions
 * - Query generation and optimization
 * - Context-aware search planning
 * - MMR diversification
 */

import type { ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { robustSanitize } from "../lib/security/sanitization";

interface SearchPlan {
  queries: string[];
  context: string;
  timestamp: number;
}

/**
 * Extract key terms from context for search enhancement
 * @param context Context string
 * @returns Array of key terms
 */
function extractKeyTerms(context: string): string[] {
  if (!context || context.length === 0) {
    return [];
  }

  // Simple term extraction - could be enhanced with NLP
  const stopWords = new Set([
    "the",
    "is",
    "at",
    "which",
    "on",
    "a",
    "an",
    "as",
    "are",
    "was",
    "were",
    "been",
    "be",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "with",
    "from",
    "by",
    "about",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "up",
    "down",
    "out",
    "off",
    "over",
    "under",
  ]);

  // Extract words from context
  const words = context
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Get unique terms and limit to top 5 by frequency
  const termCount = new Map<string, number>();
  for (const word of words) {
    termCount.set(word, (termCount.get(word) || 0) + 1);
  }

  return Array.from(termCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term]) => term);
}

/**
 * Sanitize string for use in search queries
 * @param query Query string
 * @returns Sanitized query
 */
function sanitizeForQuery(query: string): string {
  return robustSanitize(query)
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate query variations based on context
 * @param baseQuery Base query string
 * @param contextTerms Context terms
 * @returns Array of query variations
 */
function generateVariations(baseQuery: string, contextTerms: string[]): string[] {
  const variations: string[] = [];

  // Add individual context terms
  for (const term of contextTerms.slice(0, 3)) {
    variations.push(`${baseQuery} ${term}`);
  }

  // Add combinations if we have multiple terms
  if (contextTerms.length >= 2) {
    variations.push(`${baseQuery} ${contextTerms.slice(0, 2).join(" ")}`);
  }

  return variations;
}

/**
 * Apply Maximal Marginal Relevance (MMR) for query diversification
 * @param queries Array of queries
 * @param baseQuery Original query
 * @param maxQueries Maximum number of queries to return
 * @returns Diversified queries
 */
function mmrDiversify(queries: string[], baseQuery: string, maxQueries: number): string[] {
  if (queries.length <= maxQueries) {
    return queries;
  }

  // Simple MMR implementation based on string similarity
  const selected: string[] = [baseQuery];
  const remaining = queries.filter((q) => q !== baseQuery);

  while (selected.length < maxQueries && remaining.length > 0) {
    let bestScore = -1;
    let bestIndex = -1;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Calculate diversity score (simple - could be enhanced)
      let minSimilarity = 1;
      for (const sel of selected) {
        const similarity = calculateSimilarity(candidate, sel);
        minSimilarity = Math.min(minSimilarity, similarity);
      }

      // Balance relevance and diversity
      const relevance = calculateSimilarity(candidate, baseQuery);
      const score = 0.7 * relevance + 0.3 * (1 - minSimilarity);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      selected.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    } else {
      break;
    }
  }

  return selected;
}

/**
 * Calculate simple string similarity
 * @param s1 First string
 * @param s2 Second string
 * @returns Similarity score between 0 and 1
 */
function calculateSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().split(/\s+/));
  const words2 = new Set(s2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Plan context-aware search with query enhancement
 * @param ctx Action context
 * @param userMessage User's message
 * @param context Conversation context
 * @param recentMessages Recent messages
 * @returns Search plan with enhanced queries
 */
export async function planContextAwareSearch(
  ctx: ActionCtx,
  userMessage: string,
  context: string,
  _recentMessages: Doc<"messages">[],
): Promise<SearchPlan> {
  // Extract key terms from context
  const contextTerms = extractKeyTerms(context);

  // Build enhanced queries
  const baseQuery = sanitizeForQuery(userMessage);
  const enhancedQueries = [
    baseQuery,
    `${baseQuery} ${contextTerms.join(" ")}`,
    ...generateVariations(baseQuery, contextTerms),
  ];

  // Apply MMR for diversity
  const diverseQueries = mmrDiversify(enhancedQueries, baseQuery, 5);

  return {
    queries: diverseQueries,
    context: context.slice(0, 500),
    timestamp: Date.now(),
  };
}

// Placeholder exports to be replaced by extracted functions from search.ts
export const planSearch = async () => {
  // To be implemented - will be extracted from convex/search.ts
  throw new Error("Not yet implemented - will be extracted from search.ts");
};

export const buildSearchQueries = async () => {
  // To be implemented - will be extracted from convex/search.ts
  throw new Error("Not yet implemented - will be extracted from search.ts");
};
