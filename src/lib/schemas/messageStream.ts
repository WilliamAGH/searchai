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
    excludedByRelevance: z.boolean().optional(),
    relevanceThreshold: z.number().optional(),
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
