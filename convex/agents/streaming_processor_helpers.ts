import type { StreamingEventItem, ToolCallArgs } from "./streaming_event_types";
import type { AgentStreamResult } from "./streaming_processor_types";
import type { HarvestedData } from "./schema";
import { extractTextDelta } from "./streaming_tool_events";
import {
  harvestSearchResults,
  harvestScrapedContent,
} from "./streaming_harvest";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractReasoningContent(item: StreamingEventItem): string {
  if (typeof item.content === "string") return item.content;
  if (typeof item.text === "string") return item.text;
  return "";
}

export function extractToolOutput(item: StreamingEventItem): unknown {
  return item.output ?? item.rawItem?.output;
}

export function extractOutputToolName(item: StreamingEventItem): string {
  return item.toolName || item.rawItem?.name || "";
}

export function isToolError(output: unknown): boolean {
  if (!isRecord(output)) return false;
  return "error" in output && Boolean(output.error);
}

export function hasToolContext(args: ToolCallArgs): boolean {
  return Boolean(args.query || args.url || args.reasoning);
}

export function harvestToolOutput(
  output: unknown,
  toolName: string,
  harvested: HarvestedData,
): void {
  if (!isRecord(output)) return;

  if (toolName === "search_web" || "results" in output) {
    harvestSearchResults(output, harvested);
  }

  if (
    (toolName === "scrape_webpage" || "scrapedAt" in output) &&
    "url" in output &&
    "content" in output
  ) {
    harvestScrapedContent(output, harvested);
  }
}

export async function* processStreamForDeltas(
  result: AgentStreamResult,
): AsyncGenerator<{ type: "content"; delta: string }, string, undefined> {
  let accumulated = "";

  for await (const event of result) {
    if (event.type !== "run_item_stream_event") continue;

    const item = event.item;
    if (!item) continue;

    const eventName = event.name;

    if (eventName === "message_output_created") continue;

    const delta = extractTextDelta(item, eventName);
    if (delta) {
      accumulated += delta;
      yield { type: "content", delta };
    }
  }

  return accumulated;
}

export async function* processStreamForReasoning(
  result: AgentStreamResult,
): AsyncGenerator<{ type: "reasoning"; content: string }, void, undefined> {
  for await (const event of result) {
    if (event.type !== "run_item_stream_event") continue;

    const item = event.item;
    if (!item) continue;

    const eventName = event.name;

    if (eventName === "reasoning_item_created") {
      const content = extractReasoningContent(item);
      if (content) {
        yield { type: "reasoning", content };
      }
    }
  }
}
