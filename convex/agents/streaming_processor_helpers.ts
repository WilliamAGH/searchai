"use node";

import type { ToolCallArgs } from "./streaming_event_types";
import type { AgentStreamResult } from "./streaming_processor_types";
import { type HarvestedData } from "../schemas/agents";
import {
  extractReasoningContent,
  extractTextDelta,
  isReasoningEvent,
} from "./streaming_tool_events";
import {
  harvestSearchResults,
  harvestScrapedContent,
} from "./streaming_harvest";
import { isRecord } from "../lib/validators";

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

  if (toolName === "search_web") {
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
    if (event.type !== "raw_model_stream_event") continue;
    const delta = extractTextDelta(event);
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
    if (!isReasoningEvent(event)) continue;

    const content = extractReasoningContent(event.item);
    if (content) {
      yield { type: "reasoning", content };
    }
  }
}
