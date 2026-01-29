import { z } from "zod/v4";
import { MessageMetadataSchema } from "@/lib/schemas/messageStream";
import { StreamingPersistPayloadSchema } from "../../../convex/schemas/agents";

export const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  stage: z.enum(["thinking", "planning", "searching", "scraping", "analyzing", "generating"]),
  message: z.string(),
  urls: z.array(z.string()).optional(),
  currentUrl: z.string().optional(),
  queries: z.array(z.string()).optional(),
  sourcesUsed: z.number().optional(),
  toolReasoning: z.string().optional(),
  toolQuery: z.string().optional(),
  toolUrl: z.string().optional(),
});

export const ReasoningEventSchema = z.object({
  type: z.literal("reasoning"),
  content: z.string(),
});

export const ContentEventSchema = z.object({
  type: z.literal("content"),
  content: z.string().optional(),
  delta: z.string().optional(),
});

export const MetadataEventSchema = z.object({
  type: z.literal("metadata"),
  metadata: MessageMetadataSchema,
  nonce: z.string().optional(),
});

export const ToolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  toolName: z.string(),
  result: z.string(),
});

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
});

export const PersistedEventSchema = z.object({
  type: z.literal("persisted"),
  payload: StreamingPersistPayloadSchema,
  nonce: z.string(),
  signature: z.string(),
});
