import { z } from "zod/v4";
import type { Id } from "../_generated/dataModel";

/**
 * Canonical agent domain schemas (Zod v4).
 * OpenAI Agents integration uses Zod v3 only for tool parameter schemas.
 */
// ============================================
// Zod Schemas (Single Source of Truth)
// ============================================
// All types are derived via z.infer<> to eliminate redundant definitions.
// This file is intentionally Node-agnostic per [CX1] - no node: imports allowed.

/**
 * Context reference metadata for research sources.
 *
 * Why this must stay Node-free: Convex bundles anything imported from
 * queries/mutations with the V8 runtime. If this schema lived in a
 * `"use node";` module, we'd drag `node:crypto` into V8 builds.
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

/**
 * Minimal payload persisted by the streaming workflow.
 * Note: assistantMessageId is a Convex Id<"messages"> at runtime,
 * but zod validates it as a string (Convex IDs are opaque strings).
 */
export const StreamingPersistPayloadSchema = z.object({
  assistantMessageId: z.string(), // Id<"messages"> at runtime
  workflowId: z.string(),
  answer: z.string(),
  sources: z.array(z.string()),
  contextReferences: z.array(ResearchContextReferenceSchema),
});

export type StreamingPersistPayload = z.infer<
  typeof StreamingPersistPayloadSchema
> & {
  // Override assistantMessageId with proper Convex type for TS consumers
  assistantMessageId: Id<"messages">;
};

// ============================================
// Harvested Data Schemas (Unified)
// ============================================
// Consolidates HarvestedToolData and ConversationalHarvestedData
// from orchestration.ts per [DR1a] - favor existing utilities over duplicates.

/**
 * Search result harvested from tool output.
 */
export const HarvestedSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
  contextId: z.string().optional(), // Preserved from tool output for provenance tracking
});

export type HarvestedSearchResult = z.infer<typeof HarvestedSearchResultSchema>;

/**
 * Scraped content harvested from tool output.
 */
export const HarvestedScrapedContentSchema = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string(),
  summary: z.string(),
  contentLength: z.number(),
  scrapedAt: z.number(),
  contextId: z.string(),
  relevanceScore: z.number().optional(),
});

export type HarvestedScrapedContent = z.infer<
  typeof HarvestedScrapedContentSchema
>;

/**
 * SERP enrichment data (knowledge graph, answer box, etc.)
 */
export const HarvestedSerpEnrichmentSchema = z.object({
  knowledgeGraph: z
    .object({
      title: z.string().optional(),
      type: z.string().optional(),
      description: z.string().optional(),
      attributes: z.record(z.string(), z.string()).optional(),
      url: z.string().optional(),
    })
    .optional(),
  answerBox: z
    .object({
      type: z.string().optional(),
      answer: z.string().optional(),
      snippet: z.string().optional(),
      source: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  peopleAlsoAsk: z
    .array(
      z.object({
        question: z.string(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
  relatedQuestions: z
    .array(
      z.object({
        question: z.string(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
  relatedSearches: z.array(z.string()).optional(),
});

export type HarvestedSerpEnrichment = z.infer<
  typeof HarvestedSerpEnrichmentSchema
>;

/**
 * Unified harvested data container for workflow tool outputs (serializable portion).
 * Replaces both HarvestedToolData and ConversationalHarvestedData.
 *
 * @see {@link ./orchestration.ts} - streamConversationalWorkflow, streamResearchWorkflow
 */
export const HarvestedDataSchema = z.object({
  scrapedContent: z.array(HarvestedScrapedContentSchema),
  searchResults: z.array(HarvestedSearchResultSchema),
  serpEnrichment: HarvestedSerpEnrichmentSchema.optional(),
});

/** Serializable harvested data (JSON-compatible) */
export type HarvestedDataSerializable = z.infer<typeof HarvestedDataSchema>;

/**
 * Runtime harvested data with URL deduplication tracking.
 * The scrapedUrls Set is not serializable and only used during workflow execution.
 */
export type HarvestedData = HarvestedDataSerializable & {
  scrapedUrls: Set<string>;
};

/**
 * Factory to create an empty HarvestedData container with deduplication tracking.
 *
 * @returns {HarvestedData} Initial state with:
 *   - `scrapedContent`: Empty array - populated by scraper tool during research
 *   - `searchResults`: Empty array - populated by search tool during research
 *   - `serpEnrichment`: Undefined - set once from first SERP response
 *   - `scrapedUrls`: Empty Set - runtime deduplication tracker (not serialized)
 */
export function createEmptyHarvestedData(): HarvestedData {
  return {
    scrapedContent: [],
    searchResults: [],
    serpEnrichment: undefined,
    scrapedUrls: new Set(),
  };
}

// ============================================
// OpenAI Tool Output Schemas (v4 canonical)
// ============================================
// These schemas define the canonical shapes for tool outputs after they cross
// the OpenAI Agents integration boundary. Tool parameter schemas live in
// convex/agents/tools.ts using Zod v3 per SDK requirement.

const ToolCallMetadataSchema = z.object({
  toolName: z.string(),
  callStart: z.number(),
  durationMs: z.number(),
});

export const ToolSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
});

export type ToolSearchResult = z.infer<typeof ToolSearchResultSchema>;

export const SearchToolOutputSchema = z.object({
  contextId: z.string(),
  query: z.string(),
  reasoning: z.string(),
  resultCount: z.number(),
  searchMethod: z.enum(["serp", "openrouter", "duckduckgo", "fallback"]),
  hasRealResults: z.boolean(),
  enrichment: HarvestedSerpEnrichmentSchema.optional(),
  results: z.array(ToolSearchResultSchema),
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
