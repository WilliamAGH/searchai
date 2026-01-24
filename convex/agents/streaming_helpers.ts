"use node";

/**
 * Streaming Event Processing Helpers
 *
 * Extracted from orchestration.ts per [WRN1] to reduce function size
 * and improve readability of the streaming workflow.
 */

import { RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";
import { generateMessageId } from "../lib/id_generator";
import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { isUuidV7, normalizeUrl } from "./orchestration_helpers";
import type { HarvestedData } from "./schema";

// Re-export SDK types for orchestration.ts
export { RunToolCallItem, RunToolCallOutputItem };

// ============================================
// OpenAI Agents SDK Streaming Event Types
// ============================================
// These types provide structure for the dynamic event objects from the SDK.
// The SDK uses dynamic typing internally, so we define these for type safety.

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
  output?: unknown;
  toolName?: string;
}

/** Streaming event from OpenAI Agents SDK */
export interface StreamingEvent {
  type: string;
  name?: string;
  item?: StreamingEventItem;
}

// ============================================
// Tool Call Detection
// ============================================

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
  return (
    item.name ||
    item.rawItem?.name ||
    item.tool?.name ||
    item.function?.name ||
    "tool"
  );
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

/** Extract a string field from an object, returning undefined if not a string */
function extractString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
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

// ============================================
// Progress Stage Mapping
// ============================================

/** Map tool names to workflow progress stages */
export type ProgressStage =
  | "thinking"
  | "planning"
  | "searching"
  | "scraping"
  | "generating";

const TOOL_TO_STAGE: Record<string, ProgressStage> = {
  plan_research: "planning",
  search_web: "searching",
  scrape_webpage: "scraping",
};

/**
 * Get the progress stage for a tool call, if it represents a stage transition.
 * Returns null if the tool doesn't map to a stage or if already in that stage.
 */
export function getProgressStageForTool(
  toolName: string,
  currentStage: ProgressStage,
): ProgressStage | null {
  const newStage = TOOL_TO_STAGE[toolName];
  if (newStage && newStage !== currentStage) {
    return newStage;
  }
  return null;
}

/** Get human-readable message for a progress stage */
export function getProgressMessage(stage: ProgressStage): string {
  switch (stage) {
    case "thinking":
      return "Thinking...";
    case "planning":
      return "Planning research strategy...";
    case "searching":
      return "Searching the web...";
    case "scraping":
      return "Reading sources...";
    case "generating":
      return "Generating response...";
    default:
      return "Processing...";
  }
}

// ============================================
// Tool Output Harvesting
// ============================================
// Types for search results and scraped pages are defined in schema.ts (HarvestedData)

/**
 * Harvest search results from a tool output.
 * Returns the number of results harvested.
 * Preserves tool contextId for provenance tracking if present.
 */
export function harvestSearchResults(
  output: Record<string, unknown>,
  harvested: HarvestedData,
): number {
  const results = output.results as
    | Array<{
        url?: string;
        title?: string;
        snippet?: string;
        relevanceScore?: number;
      }>
    | undefined;

  if (!Array.isArray(results)) return 0;

  // Capture tool-level contextId for provenance (shared across all results from this call)
  const toolContextId =
    typeof output.contextId === "string" && isUuidV7(output.contextId)
      ? output.contextId
      : undefined;

  let count = 0;
  for (const r of results) {
    if (r.url && r.title) {
      harvested.searchResults.push({
        title: r.title,
        url: r.url,
        snippet: r.snippet || "",
        relevanceScore: r.relevanceScore || RELEVANCE_SCORES.SEARCH_RESULT,
        contextId: toolContextId, // Preserve provenance back to tool call
      });
      count++;
    }
  }
  return count;
}

/**
 * Harvest scraped content from a tool output.
 * Returns true if content was harvested, false if skipped (duplicate or invalid).
 */
export function harvestScrapedContent(
  output: Record<string, unknown>,
  harvested: HarvestedData,
): boolean {
  const rawUrl = output.url as string | undefined;
  const content = output.content as string | undefined;

  if (!rawUrl || !content) return false;

  // Normalize URL for deduplication
  const normalizedUrl = normalizeUrl(rawUrl) ?? rawUrl;
  if (harvested.scrapedUrls.has(normalizedUrl)) {
    return false; // Duplicate
  }

  harvested.scrapedUrls.add(normalizedUrl);

  // Extract or generate context ID
  const contextId =
    typeof output.contextId === "string" && isUuidV7(output.contextId)
      ? output.contextId
      : generateMessageId();

  harvested.scrapedContent.push({
    url: rawUrl,
    title: String(output.title || ""),
    content: String(content),
    summary: String(output.summary || ""),
    contentLength: content.length || 0,
    scrapedAt: (output.scrapedAt as number) || Date.now(),
    contextId,
    relevanceScore: RELEVANCE_SCORES.SCRAPED_PAGE,
  });

  return true;
}

// ============================================
// Text Delta Extraction
// ============================================

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
