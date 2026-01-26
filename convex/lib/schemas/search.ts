/**
 * Canonical Zod schemas for search-related types.
 *
 * Single source of truth for runtime validation at external boundaries.
 * Convex v validators (in ../validators.ts) handle database operations.
 *
 * @see {@link ../types/search.ts} - TypeScript interfaces (compile-time)
 * @see {@link ../validators.ts} - Convex validators (database)
 */

import { z } from "zod/v4";
import { SEARCH_METHODS } from "../types/search";

// ============================================
// Shared Constants
// ============================================

/** Source kind values - shared between SearchResult and ScrapedContent */
export const SOURCE_KINDS = ["search_result", "scraped_page"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

// ============================================
// Search Method
// ============================================

export const SearchMethodSchema = z.enum(SEARCH_METHODS);
export type SearchMethod = z.infer<typeof SearchMethodSchema>;

// ============================================
// Search Result
// ============================================

/**
 * Search result schema for external API validation.
 * relevanceScore defaults to 0.5 for APIs that don't provide it.
 */
export const SearchResultSchema = z.object({
  title: z.string().max(500),
  url: z.string().max(2000),
  snippet: z.string().max(1000),
  relevanceScore: z.number().min(0).max(1).default(0.5),
  fullTitle: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  kind: z.enum(SOURCE_KINDS).optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Strict search result (required fields only, no defaults).
 * Use for internal tool outputs where all fields are guaranteed.
 */
export const SearchResultStrictSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
  contextId: z.string().optional(),
});

export type SearchResultStrict = z.infer<typeof SearchResultStrictSchema>;

// ============================================
// Scraped Content
// ============================================

export const ScrapedContentSchema = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string(),
  summary: z.string(),
  contentLength: z.number(),
  scrapedAt: z.number(),
  contextId: z.string(),
  relevanceScore: z.number().optional(),
  sourceType: z.enum(SOURCE_KINDS).optional(),
});

export type ScrapedContent = z.infer<typeof ScrapedContentSchema>;

// ============================================
// SERP Enrichment Components (exported for reuse)
// ============================================

export const SerpQuestionSchema = z.object({
  question: z.string(),
  snippet: z.string().optional(),
});

export type SerpQuestion = z.infer<typeof SerpQuestionSchema>;

export const KnowledgeGraphSchema = z.object({
  title: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
});

export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

export const AnswerBoxSchema = z.object({
  type: z.string().optional(),
  answer: z.string().optional(),
  snippet: z.string().optional(),
  source: z.string().optional(),
  url: z.string().optional(),
});

export type AnswerBox = z.infer<typeof AnswerBoxSchema>;

// ============================================
// SERP Enrichment
// ============================================

export const SerpEnrichmentSchema = z.object({
  knowledgeGraph: KnowledgeGraphSchema.optional(),
  answerBox: AnswerBoxSchema.optional(),
  relatedQuestions: z.array(SerpQuestionSchema).optional(),
  peopleAlsoAsk: z.array(SerpQuestionSchema).optional(),
  relatedSearches: z.array(z.string()).optional(),
});

export type SerpEnrichment = z.infer<typeof SerpEnrichmentSchema>;

// ============================================
// Search Response
// ============================================

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  searchMethod: SearchMethodSchema,
  hasRealResults: z.boolean(),
  enrichment: SerpEnrichmentSchema.optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ============================================
// Default Values
// ============================================

export const DEFAULT_SEARCH_RESPONSE: SearchResponse = {
  results: [],
  searchMethod: "fallback",
  hasRealResults: false,
};
