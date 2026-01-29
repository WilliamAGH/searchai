import {
  safeParsePlanResearchToolOutput,
  safeParseScrapeToolOutput,
  safeParseSearchToolOutput,
} from "../schemas/agents";
import { isUuidV7 } from "./helpers_utils";
import type { RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";

const TOOL_RESULT_MAX_LENGTH = 200;

export const summarizeToolResult = (output: unknown): string => {
  if (output === null || typeof output === "undefined") {
    return "No output";
  }
  if (typeof output === "string") {
    return output.length > TOOL_RESULT_MAX_LENGTH
      ? `${output.slice(0, TOOL_RESULT_MAX_LENGTH)}…`
      : output;
  }
  try {
    const json = JSON.stringify(output);
    return json.length > TOOL_RESULT_MAX_LENGTH
      ? `${json.slice(0, TOOL_RESULT_MAX_LENGTH)}…`
      : json;
  } catch (serializeError) {
    console.warn("Tool result serialization failed", {
      outputType: typeof output,
      error: serializeError instanceof Error ? serializeError.message : String(serializeError),
    });
    return "[unserializable output]";
  }
};

export const extractContextIdFromOutput = (output: unknown): string | null => {
  const searchOutput = safeParseSearchToolOutput(output);
  if (searchOutput && isUuidV7(searchOutput.contextId)) {
    return searchOutput.contextId;
  }
  const scrapeOutput = safeParseScrapeToolOutput(output);
  if (scrapeOutput && isUuidV7(scrapeOutput.contextId)) {
    return scrapeOutput.contextId;
  }
  const planOutput = safeParsePlanResearchToolOutput(output);
  if (planOutput && isUuidV7(planOutput.contextId)) {
    return planOutput.contextId;
  }
  return null;
};

type ToolCallEntry = {
  toolName: string;
  args: unknown;
  startTimestamp: number;
  status?: string;
  output?: unknown;
  completionTimestamp?: number;
  order: number;
};

export function processToolCalls(
  newItems: unknown[],
  baseTimestamp: number,
  RunToolCallItemClass: typeof RunToolCallItem,
  RunToolCallOutputItemClass: typeof RunToolCallOutputItem,
): Map<string, ToolCallEntry> {
  const toolCallEntries = new Map<string, ToolCallEntry>();

  newItems.forEach((item, idx) => {
    const timestamp = baseTimestamp + idx * 10;
    if (item instanceof RunToolCallItemClass) {
      const rawCall = item.rawItem;
      if (rawCall.type === "function_call") {
        let parsedArgs: unknown = rawCall.arguments;
        try {
          parsedArgs = JSON.parse(rawCall.arguments);
        } catch (error) {
          console.warn("Failed to parse tool call arguments", {
            error,
            rawArguments: rawCall.arguments,
          });
          parsedArgs = rawCall.arguments;
        }
        toolCallEntries.set(rawCall.callId, {
          toolName: rawCall.name,
          args: parsedArgs,
          startTimestamp: timestamp,
          status: rawCall.status,
          order: idx,
        });
      }
    } else if (item instanceof RunToolCallOutputItemClass) {
      const rawOutput = item.rawItem;
      if (rawOutput.type === "function_call_result") {
        const entry: ToolCallEntry = toolCallEntries.get(rawOutput.callId) ?? {
          toolName: rawOutput.name,
          args: undefined,
          startTimestamp: timestamp,
          order: idx,
        };
        entry.output = item.output;
        entry.status = rawOutput.status;
        entry.completionTimestamp = timestamp;
        toolCallEntries.set(rawOutput.callId, entry);
      }
    }
  });

  return toolCallEntries;
}

export function buildToolCallLog(
  toolCallEntries: Map<string, ToolCallEntry>,
  summarizeToolResult: (output: unknown) => string,
): Array<{
  toolName: string;
  timestamp: number;
  reasoning: string;
  input: unknown;
  resultSummary: string;
  durationMs: number;
  success: boolean;
}> {
  return Array.from(toolCallEntries.values())
    .sort((a, b) => a.order - b.order)
    .map((entry) => {
      const args = entry.args;
      const reasoning =
        args &&
        typeof args === "object" &&
        args !== null &&
        "reasoning" in args &&
        typeof (args as Record<string, unknown>).reasoning === "string"
          ? ((args as Record<string, unknown>).reasoning as string)
          : "";
      const durationMs =
        entry.completionTimestamp !== undefined
          ? Math.max(entry.completionTimestamp - entry.startTimestamp, 0)
          : 0;
      return {
        toolName: entry.toolName,
        timestamp: entry.startTimestamp,
        reasoning,
        input: args,
        resultSummary: summarizeToolResult(entry.output),
        durationMs,
        success: entry.status === "completed",
      };
    });
}

export function buildUrlContextMap(
  toolCallEntries: Map<string, ToolCallEntry>,
  extractContextIdFromOutput: (output: unknown) => string | null,
  normalizeUrl: (url: string | undefined) => string | null,
): Map<string, string> {
  const urlContextMap = new Map<string, string>();

  for (const entry of toolCallEntries.values()) {
    const contextId = extractContextIdFromOutput(entry.output);
    if (!contextId) continue;

    if (entry.toolName === "search_web") {
      const parsed = safeParseSearchToolOutput(entry.output);
      if (parsed) {
        for (const result of parsed.results) {
          const normalized = normalizeUrl(result.url);
          if (normalized) {
            urlContextMap.set(normalized, contextId);
          }
        }
      }
    } else if (entry.toolName === "scrape_webpage") {
      const parsed = safeParseScrapeToolOutput(entry.output);
      if (parsed) {
        const normalized = normalizeUrl(parsed.url);
        if (normalized) {
          urlContextMap.set(normalized, contextId);
        }
      }
    }
  }

  return urlContextMap;
}
