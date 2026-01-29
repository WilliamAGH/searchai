"use node";

import { RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";
import type { StreamingEventItem, ToolCallArgs } from "./streaming_event_types";

/**
 * Detect if a streaming event represents a tool call.
 * Handles multiple patterns from OpenAI Agents SDK for compatibility.
 */
export function isToolCallEvent(
  item: StreamingEventItem | undefined,
  eventName: string | undefined,
): boolean {
  if (!item) return false;

  return (
    item instanceof RunToolCallItem ||
    item.rawItem?.type === "function_call" ||
    item.type === "tool_call" ||
    item.type === "function_call" ||
    eventName === "tool_called" ||
    eventName === "tool_call_created" ||
    eventName === "function_call_item_created"
  );
}

/**
 * Extract tool name from a streaming event item.
 * Handles various SDK patterns for tool name location.
 */
export function extractToolName(item: StreamingEventItem): string {
  return item.name || item.rawItem?.name || item.tool?.name || item.function?.name || "tool";
}

/**
 * Extract a string field from an object.
 * Returns undefined if field is not present.
 * Logs warning and returns undefined if field is present but not a string
 * (indicates schema mismatch worth investigating).
 */
function extractString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object" || !(key in obj)) {
    return undefined; // Field not present - normal case
  }

  const value = (obj as Record<string, unknown>)[key];
  if (typeof value === "string") {
    return value;
  }

  // Field present but wrong type - log for observability
  console.warn(`Tool argument "${key}" present but not a string:`, typeof value);
  return undefined;
}

/**
 * Extract tool arguments from a streaming event item.
 * The SDK provides arguments as a JSON string - we parse and extract relevant fields.
 * This is model-agnostic since tools enforce the reasoning parameter via Zod schema.
 *
 * Returns empty object if no arguments present or if parsing fails.
 * Parse failures are logged for observability but don't propagate errors since
 * missing tool args are non-fatal (the tool will still execute).
 */
export function extractToolArgs(item: StreamingEventItem): ToolCallArgs {
  // Try multiple locations where arguments might be stored
  const argsString =
    (item as { arguments?: string }).arguments ||
    (item.rawItem as { arguments?: string } | undefined)?.arguments;

  if (!argsString || typeof argsString !== "string") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(argsString);
  } catch {
    // Non-fatal: log for observability but don't block streaming
    console.warn("Tool arguments not valid JSON, skipping extraction");
    return {};
  }

  return {
    query: extractString(parsed, "query"),
    url: extractString(parsed, "url"),
    reasoning: extractString(parsed, "reasoning"),
  };
}

/**
 * Detect if a streaming event represents a tool output.
 */
export function isToolOutputEvent(
  item: StreamingEventItem | undefined,
  eventName: string | undefined,
): boolean {
  if (!item) return false;

  return (
    item instanceof RunToolCallOutputItem ||
    item.type === "tool_call_output" ||
    item.type === "function_call_output" ||
    eventName === "tool_output" ||
    eventName === "tool_call_output_created" ||
    eventName === "function_call_output_item_created"
  );
}

/**
 * Extract text delta from a streaming event item.
 * Returns the delta string or null if not a text event.
 */
export function extractTextDelta(
  item: StreamingEventItem,
  eventName: string | undefined,
): string | null {
  const delta =
    item.delta?.content ||
    item.content_delta ||
    item.text_delta ||
    (eventName?.includes("delta") ? item.content : undefined);

  if (delta && typeof delta === "string" && delta.length > 0) {
    return delta;
  }
  return null;
}
