/**
 * Shared search-related types used across backend and frontend layers.
 * Keep this file Node-agnostic so it can be imported from Convex V8 runtimes
 * and browser bundles without pulling in any Node-only dependencies.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
  fullTitle?: string;
  summary?: string;
  content?: string;
  kind?: "search_result" | "scraped_page";
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  summary: string;
  contentLength: number;
  scrapedAt: number;
  contextId: string;
  relevanceScore?: number;
  sourceType?: "search_result" | "scraped_page";
}

export interface KnowledgeGraphData {
  title?: string;
  type?: string;
  description?: string;
  attributes?: Record<string, string>;
  url?: string;
}

export interface AnswerBoxData {
  type?: string;
  answer?: string;
  snippet?: string;
  source?: string;
  url?: string;
}

export interface SerpEnrichment {
  knowledgeGraph?: KnowledgeGraphData;
  answerBox?: AnswerBoxData;
  relatedQuestions?: Array<{ question: string; snippet?: string }>;
  peopleAlsoAsk?: Array<{ question: string; snippet?: string }>;
  relatedSearches?: string[];
}

export interface SearchProviderResult {
  results: SearchResult[];
  enrichment?: SerpEnrichment;
}

/**
 * Available search provider methods.
 * Single source of truth - used by vSearchMethod validator and Zod schemas.
 */
export const SEARCH_METHODS = [
  "serp",
  "openrouter",
  "duckduckgo",
  "fallback",
] as const;

/**
 * Search method type - derived from SEARCH_METHODS const array.
 * @see {@link ./validators.ts} vSearchMethod - Convex validator
 * @see {@link ../../../src/lib/schemas/apiResponses.ts} SearchMethodSchema - Zod schema
 */
export type SearchMethod = (typeof SEARCH_METHODS)[number];

/**
 * Cached search response structure
 * Used by searchResultCache in search/cache.ts
 */
export interface CachedSearchResponse {
  results: SearchResult[];
  searchMethod: SearchMethod;
  hasRealResults: boolean;
  enrichment?: SerpEnrichment;
}
