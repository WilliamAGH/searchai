/**
 * Agent domain schemas (Zod v4).
 *
 * Per [VL1]: Imports search schemas from canonical location.
 * Agent-specific schemas (context references, tool outputs) defined here.
 */

import { z } from "zod/v4";
import type { Id } from "../_generated/dataModel";
import {
  SearchMethodSchema,
  SearchResultStrictSchema,
  ScrapedContentSchema,
  SerpEnrichmentSchema,
} from "./search";
import { safeParseOrNull } from "../lib/validation/zodUtils";
import {
  WebResearchSourceSchema,
  WebResearchSourcesSchema,
} from "./webResearchSources";

// Re-export canonical types for consumers (no aliasing)
export { SerpEnrichmentSchema, type SerpEnrichment } from "./search";
export { WebResearchSourceSchema, WebResearchSourcesSchema };

// ============================================
// Web Research Sources (Canonical)
// ============================================

/**
 * Deprecated name retained in comments only.
 * The canonical domain concept is WebResearchSource.
 */

// ============================================
// Streaming Persist Payload
// ============================================

export const StreamingPersistPayloadSchema = z.object({
  assistantMessageId: z.string(),
  workflowId: z.string(),
  answer: z.string(),
  webResearchSources: z.array(WebResearchSourceSchema),
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
  contentLength: z.number(),
  scrapedAt: z.number(),
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

/**
 * Parse search tool output with logging on failure.
 * Per [ZV1c]: Logs include tool name for identification.
 */
export const safeParseSearchToolOutput = (
  value: unknown,
  recordId?: string,
): SearchToolOutput | null => {
  const context = recordId
    ? `SearchToolOutput [${recordId}]`
    : "SearchToolOutput";
  return safeParseOrNull(SearchToolOutputSchema, value, context);
};

/**
 * Parse scrape tool output with logging on failure.
 * Per [ZV1c]: Logs include URL for identification.
 */
export const safeParseScrapeToolOutput = (
  value: unknown,
  recordId?: string,
): ScrapeToolOutput | null => {
  const context = recordId
    ? `ScrapeToolOutput [${recordId}]`
    : "ScrapeToolOutput";
  return safeParseOrNull(ScrapeToolOutputSchema, value, context);
};

/**
 * Parse plan research tool output with logging on failure.
 * Per [ZV1c]: Logs include context ID for identification.
 */
export const safeParsePlanResearchToolOutput = (
  value: unknown,
  recordId?: string,
): PlanResearchToolOutput | null => {
  const context = recordId
    ? `PlanResearchToolOutput [${recordId}]`
    : "PlanResearchToolOutput";
  return safeParseOrNull(PlanResearchToolOutputSchema, value, context);
};

// ============================================
// Agent Output Schemas (re-export from canonical location)
// ============================================
// Per [TY1d]: This is the canonical location (convex/schemas/)
// Per [VL1d]: No duplication - import from canonical location

export {
  PlanningOutputSchema,
  ResearchOutputSchema,
  safeParsePlanningOutput,
  safeParseResearchOutput,
  type PlanningOutput,
  type ResearchOutput,
  type PlannedSearchQuery,
  type KeyFinding,
  type SourceUsed,
} from "./agentOutput";

// ============================================
// Convex Query Result Types
// ============================================
// These types match the return values of Convex queries used in orchestration.
// Using explicit types instead of `any` per [TY1f].

/**
 * Result from getChatById/getChatByIdHttp queries.
 * Matches the subset of fields accessed in workflow initialization.
 */
export interface ChatQueryResult {
  _id: Id<"chats">;
  title?: string;
  sessionId?: string;
  userId?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Result from getChatMessages/getChatMessagesHttp queries.
 * Array of messages with role and content.
 */
export interface MessageQueryResult {
  _id: Id<"messages">;
  role: "user" | "assistant" | "system";
  content?: string;
  createdAt?: number;
}
