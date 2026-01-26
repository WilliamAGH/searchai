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
 * Search method type - matches vSearchMethod validator
 */
export type SearchMethod = "serp" | "openrouter" | "duckduckgo" | "fallback";

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
