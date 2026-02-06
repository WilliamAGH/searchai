/**
 * Canonical Zod schemas for Web Research Sources.
 *
 * This is the single domain object for "websites used during web research"
 * across backend + frontend.
 *
 * Per [VL1d]: define the schema once and import it everywhere.
 */

import { z } from "zod/v4";

export const WebResearchSourceTypeSchema = z.enum([
  "search_result",
  "scraped_page",
  "research_summary",
]);

/**
 * A single web research source used by the system.
 *
 * This is intentionally URL-forward:
 * - the UI needs URLs for linking
 * - streaming and persistence need stable identifiers (contextId)
 */
export const WebResearchSourceSchema = z.object({
  /** Stable identifier for correlating tool outputs and UI entries (UUIDv7). */
  contextId: z.string(),
  type: WebResearchSourceTypeSchema,
  url: z.string().optional(),
  title: z.string().optional(),
  timestamp: z.number(),
  relevanceScore: z.number().optional(),
  metadata: z.unknown().optional(),
});

export const WebResearchSourcesSchema = z.array(WebResearchSourceSchema);
