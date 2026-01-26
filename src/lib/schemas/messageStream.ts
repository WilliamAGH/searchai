/**
 * Message streaming schemas
 *
 * Single source of truth for stream metadata payloads.
 */

import { z } from "zod/v4";
import { ResearchContextReferenceSchema } from "../../../convex/agents/schema";
import { SearchResultSchema } from "@/lib/schemas/apiResponses";

const StreamSearchResultSchema = SearchResultSchema.extend({
  fullTitle: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  kind: z.enum(["search_result", "scraped_page"]).optional(),
});

export const ContextReferenceSchema = ResearchContextReferenceSchema.omit({
  metadata: true,
}).strip();

export type ContextReference = z.infer<typeof ContextReferenceSchema>;

export const MessageMetadataSchema = z
  .object({
    workflowId: z.string().optional(),
    contextReferences: z.array(ContextReferenceSchema).optional(),
    sources: z.array(z.string()).optional(),
    searchResults: z.array(StreamSearchResultSchema).optional(),
  })
  .strip();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;
