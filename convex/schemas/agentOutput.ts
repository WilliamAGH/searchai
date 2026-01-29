/**
 * Canonical Zod schemas for agent output validation.
 *
 * Validates OpenAI Agents SDK outputs at the SDK boundary per [VL1b].
 * These schemas validate data FROM the SDK before use in workflows.
 *
 * @see {@link ./search.ts} - Search-related schemas (imported here)
 * @see {@link ../../agents/orchestration.ts} - Consumer of these schemas
 */

import { z } from "zod/v4";
import { ScrapedContentSchema, SerpEnrichmentSchema } from "./search";
import { safeParseOrNull } from "../lib/validation/zodUtils";

// ============================================
// Planning Output Schema
// ============================================

/**
 * Search query from the planning phase.
 * Priority 1 = highest, 3 = lowest.
 */
export const PlannedSearchQuerySchema = z.object({
  query: z.string(),
  reasoning: z.string(),
  priority: z.number().min(1).max(3),
});

export type PlannedSearchQuery = z.infer<typeof PlannedSearchQuerySchema>;

/**
 * Planning agent output schema.
 * Validates SDK output at boundary per [VL1b].
 *
 * Mirrors the Zod v3 outputType in definitions.ts but uses v4 for validation.
 */
export const PlanningOutputSchema = z.object({
  userIntent: z.string(),
  informationNeeded: z.array(z.string()).default([]),
  searchQueries: z.array(PlannedSearchQuerySchema).default([]),
  needsWebScraping: z.boolean().default(false),
  anticipatedChallenges: z.array(z.string()).nullable().optional(),
  confidenceLevel: z.number().min(0).max(1).default(0.5),
});

export type PlanningOutput = z.infer<typeof PlanningOutputSchema>;

// ============================================
// Research Output Schema
// ============================================

/**
 * Key finding from research phase.
 * Confidence is string enum to match SDK output.
 */
export const KeyFindingSchema = z.object({
  finding: z.string(),
  sources: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export type KeyFinding = z.infer<typeof KeyFindingSchema>;

/**
 * Source used in research.
 * Tracks provenance via contextId.
 */
export const SourceUsedSchema = z.object({
  url: z.string().max(2000).optional(),
  title: z.string().optional(),
  contextId: z.string(),
  type: z.enum(["search_result", "scraped_page"]),
  relevance: z.string().optional(), // "high" | "medium" | "low"
});

export type SourceUsed = z.infer<typeof SourceUsedSchema>;

/**
 * Research agent output schema.
 * Validates SDK output at boundary per [VL1b].
 *
 * Mirrors the Zod v3 outputType in definitions.ts but uses v4 for validation.
 */
export const ResearchOutputSchema = z.object({
  researchSummary: z.string(),
  keyFindings: z.array(KeyFindingSchema).default([]),
  sourcesUsed: z.array(SourceUsedSchema).default([]),
  informationGaps: z.array(z.string()).nullable().optional(),
  scrapedContent: z.array(ScrapedContentSchema).nullable().optional(),
  serpEnrichment: SerpEnrichmentSchema.nullable().optional(),
  researchQuality: z
    .enum(["comprehensive", "adequate", "limited"])
    .default("adequate"),
});

export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// ============================================
// Safe Parse Helpers
// ============================================

/**
 * Safely parse planning agent output with logging on failure.
 *
 * Per [ZV1c]: Logs include workflowId for identification.
 *
 * @param value - Unknown value from SDK
 * @param workflowId - Workflow identifier for logging
 * @returns Parsed PlanningOutput or null (failure logged)
 */
export function safeParsePlanningOutput(
  value: unknown,
  workflowId: string,
): PlanningOutput | null {
  return safeParseOrNull(
    PlanningOutputSchema,
    value,
    `PlanningOutput [workflow=${workflowId}]`,
  );
}

/**
 * Safely parse research agent output with logging on failure.
 *
 * Per [ZV1c]: Logs include workflowId for identification.
 *
 * @param value - Unknown value from SDK
 * @param workflowId - Workflow identifier for logging
 * @returns Parsed ResearchOutput or null (failure logged)
 */
export function safeParseResearchOutput(
  value: unknown,
  workflowId: string,
): ResearchOutput | null {
  return safeParseOrNull(
    ResearchOutputSchema,
    value,
    `ResearchOutput [workflow=${workflowId}]`,
  );
}
