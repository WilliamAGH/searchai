/**
 * Agent domain schemas (Zod v4).
 *
 * Per [VL1]: Imports search schemas from canonical location.
 * Agent-specific schemas (context references, tool outputs) defined here.
 *
 * @see {@link ../lib/schemas/search.ts} - canonical search schemas
 */

import { z } from "zod/v4";
import type { Id } from "../_generated/dataModel";
import {
  SearchMethodSchema,
  SearchResultStrictSchema,
  ScrapedContentSchema,
  SerpEnrichmentSchema,
  type SearchResultStrict,
  type ScrapedContent,
  type SerpEnrichment,
} from "../lib/schemas/search";

// Re-export canonical types for consumers (no aliasing)
export {
  SerpEnrichmentSchema,
  type SerpEnrichment,
} from "../lib/schemas/search";

// ============================================
// Context Reference Schema
// ============================================

/**
 * Context reference metadata for research sources.
 * Node-agnostic per [CX1] - no node: imports allowed.
 *
 * @see {@link ../lib/validators.ts} - Convex validators mirror this schema
 */
export const ResearchContextReferenceSchema = z.object({
  contextId: z.string(),
  type: z.enum(["search_result", "scraped_page", "research_summary"]),
  url: z.string().optional(),
  title: z.string().optional(),
  timestamp: z.number(),
  relevanceScore: z.number().optional(),
  metadata: z.unknown().optional(),
});

export type ResearchContextReference = z.infer<
  typeof ResearchContextReferenceSchema
>;

// ============================================
// Streaming Persist Payload
// ============================================

export const StreamingPersistPayloadSchema = z.object({
  assistantMessageId: z.string(),
  workflowId: z.string(),
  answer: z.string(),
  sources: z.array(z.string()),
  contextReferences: z.array(ResearchContextReferenceSchema),
});

export type StreamingPersistPayload = z.infer<
  typeof StreamingPersistPayloadSchema
> & {
  assistantMessageId: Id<"messages">;
};

// ============================================
// Harvested Data (uses canonical schemas directly)
// ============================================

/**
 * Unified harvested data container for workflow tool outputs.
 * Uses canonical schemas - no local redefinitions.
 */
export const HarvestedDataSchema = z.object({
  scrapedContent: z.array(ScrapedContentSchema),
  searchResults: z.array(SearchResultStrictSchema),
  serpEnrichment: SerpEnrichmentSchema.optional(),
});

export type HarvestedDataSerializable = z.infer<typeof HarvestedDataSchema>;

/** Runtime harvested data with URL deduplication tracking */
export type HarvestedData = HarvestedDataSerializable & {
  scrapedUrls: Set<string>;
};

/** Expose canonical types for consumers */
export type HarvestedSearchResult = SearchResultStrict;
export type HarvestedScrapedContent = ScrapedContent;
export type HarvestedSerpEnrichment = SerpEnrichment;

export function createEmptyHarvestedData(): HarvestedData {
  return {
    scrapedContent: [],
    searchResults: [],
    serpEnrichment: undefined,
    scrapedUrls: new Set(),
  };
}

// ============================================
// Tool Output Schemas
// ============================================

const ToolCallMetadataSchema = z.object({
  toolName: z.string(),
  callStart: z.number(),
  durationMs: z.number(),
});

export const SearchToolOutputSchema = z.object({
  contextId: z.string(),
  query: z.string(),
  reasoning: z.string(),
  resultCount: z.number(),
  searchMethod: SearchMethodSchema,
  hasRealResults: z.boolean(),
  enrichment: SerpEnrichmentSchema.optional(),
  results: z.array(SearchResultStrictSchema),
  timestamp: z.number(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
  _toolCallMetadata: ToolCallMetadataSchema.optional(),
});

export type SearchToolOutput = z.infer<typeof SearchToolOutputSchema>;

export const ScrapeToolOutputSchema = z.object({
  contextId: z.string(),
  url: z.string(),
  reasoning: z.string(),
  title: z.string(),
  content: z.string(),
  summary: z.string(),
  contentLength: z.number().optional(),
  scrapedAt: z.number().optional(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
  _toolCallMetadata: ToolCallMetadataSchema.optional(),
});

export type ScrapeToolOutput = z.infer<typeof ScrapeToolOutputSchema>;

export const PlanResearchToolOutputSchema = z.object({
  contextId: z.string(),
  status: z.literal("research_planned"),
  userQuestion: z.string(),
  researchGoal: z.string(),
  searchQueries: z.array(
    z.object({
      query: z.string(),
      priority: z.number().min(1).max(3),
    }),
  ),
  instruction: z.string(),
  timestamp: z.number(),
});

export type PlanResearchToolOutput = z.infer<
  typeof PlanResearchToolOutputSchema
>;

// ============================================
// Safe Parse Helpers
// ============================================

export const safeParseSearchToolOutput = (
  value: unknown,
): SearchToolOutput | null => {
  const parsed = SearchToolOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const safeParseScrapeToolOutput = (
  value: unknown,
): ScrapeToolOutput | null => {
  const parsed = ScrapeToolOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const safeParsePlanResearchToolOutput = (
  value: unknown,
): PlanResearchToolOutput | null => {
  const parsed = PlanResearchToolOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
