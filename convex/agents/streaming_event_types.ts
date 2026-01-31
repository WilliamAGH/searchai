"use node";

import { RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";

// Re-export SDK types for orchestration workflows
export { RunToolCallItem, RunToolCallOutputItem };

/** Raw item from OpenAI Agents SDK streaming event */
export interface StreamingEventItem {
  type?: string;
  name?: string;
  rawItem?: {
    type?: string;
    name?: string;
    output?: unknown;
  };
  tool?: { name?: string };
  function?: { name?: string };
  delta?: { content?: string };
  content_delta?: string;
  text_delta?: string;
  content?: string;
  text?: string;
  output?: unknown;
  toolName?: string;
}

/** Streaming event from OpenAI Agents SDK */
export interface StreamingEvent {
  type: string;
  name?: string;
  item?: StreamingEventItem;
}

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
