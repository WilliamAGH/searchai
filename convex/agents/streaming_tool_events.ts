"use node";

import {
  RunReasoningItem,
  RunToolCallItem,
  RunToolCallOutputItem,
  type RunItemStreamEvent,
  type RunRawModelStreamEvent,
} from "@openai/agents";
import type { ToolCallArgs } from "./streaming_event_types";
import { isRecord } from "../lib/validators";

type ToolCallStreamEvent = RunItemStreamEvent & {
  name: "tool_called";
  item: RunToolCallItem;
};

type ToolOutputStreamEvent = RunItemStreamEvent & {
  name: "tool_output";
  item: RunToolCallOutputItem;
};

type ReasoningStreamEvent = RunItemStreamEvent & {
  name: "reasoning_item_created";
  item: RunReasoningItem;
};

/**
 * Detect if a streaming event represents a tool call.
 * Uses SDK-native event name + typed item contract.
 */
export function isToolCallEvent(
  event: RunItemStreamEvent,
): event is ToolCallStreamEvent {
  return event.name === "tool_called" && event.item instanceof RunToolCallItem;
}

/**
 * Detect if a streaming event represents a tool output.
 * Uses SDK-native event name + typed item contract.
 */
export function isToolOutputEvent(
  event: RunItemStreamEvent,
): event is ToolOutputStreamEvent {
  return (
    event.name === "tool_output" && event.item instanceof RunToolCallOutputItem
  );
}

/**
 * Detect if a streaming event represents reasoning content.
 * Uses SDK-native event name + typed item contract.
 */
export function isReasoningEvent(
  event: RunItemStreamEvent,
): event is ReasoningStreamEvent {
  return (
    event.name === "reasoning_item_created" &&
    event.item instanceof RunReasoningItem
  );
}

/**
 * Extract tool name from a typed tool call item.
 */
export function extractToolName(item: RunToolCallItem): string {
  if ("name" in item.rawItem && typeof item.rawItem.name === "string") {
    return item.rawItem.name;
  }
  return "tool";
}

/**
 * Extract tool name from a typed tool output item.
 */
export function extractOutputToolName(item: RunToolCallOutputItem): string {
  if ("name" in item.rawItem && typeof item.rawItem.name === "string") {
    return item.rawItem.name;
  }
  return "tool";
}

/**
 * Extract tool output payload from a typed tool output item.
 */
export function extractToolOutput(item: RunToolCallOutputItem): unknown {
  return item.output;
}

/**
 * Extract and parse tool arguments from a typed tool call item.
 * Arguments are JSON strings in SDK protocol items.
 */
export function extractToolArgs(item: RunToolCallItem): ToolCallArgs {
  const argsString =
    "arguments" in item.rawItem ? item.rawItem.arguments : undefined;
  if (typeof argsString !== "string" || argsString.length === 0) {
    return {};
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(argsString);
  } catch {
    console.warn("Tool arguments are not valid JSON; skipping extraction");
    return {};
  }

  if (!isRecord(parsed)) {
    return {};
  }

  const query = parsed.query;
  const url = parsed.url;
  const reasoning = parsed.reasoning;

  return {
    query: typeof query === "string" ? query : undefined,
    url: typeof url === "string" ? url : undefined,
    reasoning: typeof reasoning === "string" ? reasoning : undefined,
  };
}

/**
 * Extract reasoning text from a typed reasoning item.
 */
export function extractReasoningContent(item: RunReasoningItem): string {
  if (item.rawItem.type !== "reasoning") {
    return "";
  }

  const primaryText = item.rawItem.content
    .map((part) => part.text)
    .filter((text) => typeof text === "string" && text.length > 0)
    .join("");

  if (primaryText.length > 0) {
    return primaryText;
  }

  const rawContent = item.rawItem.rawContent ?? [];
  return rawContent
    .map((part) => part.text)
    .filter((text) => typeof text === "string" && text.length > 0)
    .join("");
}

/**
 * Extract text deltas from SDK raw-model events.
 * StreamedRunResult.toTextStream() uses this same event contract internally.
 */
export function extractTextDelta(event: RunRawModelStreamEvent): string | null {
  if (
    event.data.type === "output_text_delta" &&
    typeof event.data.delta === "string" &&
    event.data.delta.length > 0
  ) {
    return event.data.delta;
  }
  return null;
}
