/**
 * Message streaming schemas
 *
 * Per [VL1]: Uses canonical schemas from convex/schemas/.
 */

import { z } from "zod/v4";
import { WebResearchSourceSchema } from "../../../convex/schemas/webResearchSources";

export const CrawlMetadataSchema = z
  .object({
    crawlAttempted: z.boolean().optional(),
    crawlSucceeded: z.boolean().optional(),
    crawlErrorMessage: z.string().optional(),
    /**
     * Annotation only: this source scored below relevance threshold when
     * metadata was built post-run. It does not imply model-context filtering.
     */
    markedLowRelevance: z.boolean().optional(),
    relevanceThreshold: z.number().optional(),
    /**
     * Developer-inspection markdown copied from server-side Convex harvest data.
     * This is provenance/debug text only and does not change model context.
     */
    serverContextMarkdown: z.string().optional(),
    /**
     * Persisted scraped page body content for `scraped_page` sources.
     * This mirrors the cleaned body captured by the scrape tool.
     */
    scrapedBodyContent: z.string().optional(),
    scrapedBodyContentLength: z.number().optional(),
  })
  .strip();

export const WebResearchSourceClientSchema = WebResearchSourceSchema.extend({
  metadata: CrawlMetadataSchema.optional(),
}).strip();

export type WebResearchSourceClient = z.infer<
  typeof WebResearchSourceClientSchema
>;

export const MessageMetadataSchema = z
  .object({
    workflowId: z.string().optional(),
    webResearchSources: z.array(WebResearchSourceClientSchema).optional(),
  })
  .strip();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;
