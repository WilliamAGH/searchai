/**
 * Message streaming schemas
 *
 * Per [VL1]: Uses canonical schemas from convex/lib/schemas/.
 */

import { z } from "zod/v4";
import { ResearchContextReferenceSchema } from "../../../convex/agents/schema";
import { SearchResultSchema } from "@/lib/schemas/apiResponses";

export const ContextReferenceSchema = ResearchContextReferenceSchema.omit({
  metadata: true,
}).strip();

export type ContextReference = z.infer<typeof ContextReferenceSchema>;

export const MessageMetadataSchema = z
  .object({
    workflowId: z.string().optional(),
    contextReferences: z.array(ContextReferenceSchema).optional(),
    sources: z.array(z.string()).optional(),
    searchResults: z.array(SearchResultSchema).optional(),
  })
  .strip();

export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;
