"use node";

import type {
  RunItemStreamEvent,
  RunRawModelStreamEvent,
  RunStreamEvent,
} from "@openai/agents";

export type { RunItemStreamEvent, RunRawModelStreamEvent, RunStreamEvent };

/**
 * Tool call arguments extracted from streaming events.
 * Used to surface the LLM's reasoning before tool execution completes.
 */
export interface ToolCallArgs {
  /** The search query or URL being accessed */
  query?: string;
  url?: string;
  /** The LLM's explanation of why this tool call is needed (schema-enforced) */
  reasoning?: string;
}
