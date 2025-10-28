"use node";

import type { ResearchContextReference } from "./types";
import { buildTemporalHeader } from "../lib/dateTime";

/**
 * Shared helper functions for agent orchestration
 * These are extracted to avoid duplication between streaming and non-streaming workflows
 */

// ============================================
// Constants and Utilities
// ============================================

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_RESULT_MAX_LENGTH = 200;

export const isUuidV7 = (value: string | undefined): boolean =>
  !!value && UUID_V7_REGEX.test(value);

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
  } catch {
    return "[unserializable output]";
  }
};

export const normalizeUrl = (rawUrl: string | undefined): string | null => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
};

export const extractContextIdFromOutput = (output: unknown): string | null => {
  if (!output || typeof output !== "object") return null;
  const candidate = (output as { contextId?: string }).contextId;
  return candidate && isUuidV7(candidate) ? candidate : null;
};

// ============================================
// Instruction Builders
// ============================================

export function buildPlanningInput(
  userQuery: string,
  conversationContext?: string,
): string {
  const temporal = buildTemporalHeader();
  return conversationContext
    ? `${temporal}\n\nUser Question: ${userQuery}\n\nConversation Context:\n${conversationContext}`
    : `${temporal}\n\n${userQuery}`;
}

export function buildResearchInstructions(params: {
  userQuery: string;
  userIntent: string;
  conversationBlock: string;
  referenceBlock: string;
  informationNeeded: string[];
  searchQueries: Array<{ query: string; reasoning: string; priority: number }>;
  needsWebScraping: boolean;
}): string {
  return `
ORIGINAL QUESTION: ${params.userQuery}

USER INTENT: ${params.userIntent}

${params.conversationBlock}${params.referenceBlock ? `${params.referenceBlock}\n\n` : ""}INFORMATION NEEDED:
${params.informationNeeded.map((info, i) => `${i + 1}. ${info}`).join("\n")}

SEARCH PLAN:
${params.searchQueries
  .map(
    (q, i) => `${i + 1}. Query: "${q.query}"
   Reasoning: ${q.reasoning}
   Priority: ${q.priority}`,
  )
  .join("\n\n")}

YOUR TASK:
1. Execute each planned search using the search_web tool
2. Review search results and identify the most authoritative sources
3. Scrape ${params.needsWebScraping ? "2-5" : "1-3"} of the most relevant URLs using scrape_webpage tool
4. Synthesize all findings into a comprehensive research summary

Remember:
- Always provide reasoning when calling tools
- Track all sources and their context IDs
- Cross-reference information from multiple sources
- Note any information gaps or conflicting data
`;
}

export function buildSynthesisInstructions(params: {
  userQuery: string;
  userIntent: string;
  researchSummary: string;
  keyFindings: Array<{
    finding: string;
    sources: string[];
    confidence: string;
  }>;
  sourcesUsed: Array<{
    url: string;
    title: string;
    type: string;
    relevance: string;
  }>;
  informationGaps?: string[];
}): string {
  const sourcesAvailable = params.sourcesUsed
    .map((source, i) => {
      const index = i + 1;
      if (source?.url) {
        try {
          const hostname = new URL(source.url).hostname;
          return `${index}. [${hostname}] ${source.title}
   Type: ${source.type}
   Relevance: ${source.relevance}
   URL: ${source.url}`;
        } catch {
          return `${index}. ${source.title}
   Type: ${source.type}
   Relevance: ${source.relevance}
   URL: ${source.url}`;
        }
      }
      return `${index}. ${source.title}
   Type: ${source.type}
   Relevance: ${source.relevance}`;
    })
    .join("\n");

  return `
ORIGINAL QUESTION: ${params.userQuery}

USER INTENT: ${params.userIntent}

RESEARCH FINDINGS:

${params.researchSummary}

KEY FACTS:
${params.keyFindings
  .map(
    (finding, i) => `${i + 1}. ${finding.finding}
   Sources: ${finding.sources.join(", ")}
   Confidence: ${finding.confidence}`,
  )
  .join("\n\n")}

SOURCES AVAILABLE:
${sourcesAvailable}

${
  params.informationGaps?.length
    ? `INFORMATION GAPS:\n${params.informationGaps.map((gap, i) => `${i + 1}. ${gap}`).join("\n")}\n`
    : ""
}

YOUR TASK:
1. Write a direct, clear answer to: "${params.userQuery}"
2. Start immediately with the answer - no preamble
3. Cite sources inline using [domain.com] format
4. Only mention limitations if genuinely relevant
5. Use markdown formatting for readability

Remember the user wants to know: ${params.userIntent}
`;
}

// ============================================
// Context Reference Utilities
// ============================================

export function formatContextReferencesForPrompt(
  references:
    | Array<{
        contextId: string;
        type: string;
        url?: string;
        title?: string;
        relevanceScore?: number;
      }>
    | undefined,
): string {
  if (!references?.length) return "";
  const recent = references
    .slice(-8)
    .map((ref, idx) => {
      let label = ref.title || ref.url || ref.contextId;
      if (!label && ref.url) {
        try {
          label = new URL(ref.url).hostname;
        } catch {
          label = ref.url;
        }
      }
      const relevance =
        typeof ref.relevanceScore === "number"
          ? ` (relevance ${ref.relevanceScore.toFixed(2)})`
          : "";
      return `${idx + 1}. ${label}${
        ref.url ? ` — ${ref.url}` : ""
      }${relevance} [${ref.contextId}]`;
    })
    .join("\n");
  return `PREVIOUS CONTEXT REFERENCES:\n${recent}`;
}

export function convertToContextReferences(
  sourcesUsed: Array<{
    contextId: string;
    type: "search_result" | "scraped_page";
    url: string;
    title: string;
    relevance: "high" | "medium" | "low";
  }>,
): ResearchContextReference[] {
  return sourcesUsed.map((src) => ({
    contextId: src.contextId,
    type: src.type,
    url: src.url,
    title: src.title,
    timestamp: Date.now(),
    relevanceScore:
      src.relevance === "high" ? 0.9 : src.relevance === "medium" ? 0.7 : 0.5,
  }));
}

// ============================================
// Context Building from Messages
// ============================================

export function buildConversationContext(
  messages: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
  }>,
): string {
  return messages
    .slice(-20)
    .map(
      (m) =>
        `${m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}: ${m.content || ""}`,
    )
    .join("\n")
    .slice(0, 4000);
}

export function extractContextReferencesFromMessages<
  T extends { contextReferences?: Array<{ contextId: string }> },
>(
  messages: T[],
): Array<T["contextReferences"] extends Array<infer U> ? U : never> {
  const refs: any[] = [];
  for (const msg of messages || []) {
    if (Array.isArray(msg.contextReferences)) {
      for (const ref of msg.contextReferences) {
        if (!refs.find((existing) => existing.contextId === ref.contextId)) {
          refs.push(ref);
        }
      }
    }
  }
  return refs;
}

export function buildConversationBlock(
  conversationContext: string | undefined,
): string {
  return conversationContext
    ? `RECENT CONVERSATION CONTEXT:\n${conversationContext}\n\n`
    : "";
}

// ============================================
// Tool Call Processing
// ============================================

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
  newItems: any[],
  baseTimestamp: number,
  RunToolCallItem: any,
  RunToolCallOutputItem: any,
): Map<string, ToolCallEntry> {
  const toolCallEntries = new Map<string, ToolCallEntry>();

  newItems.forEach((item, idx) => {
    const timestamp = baseTimestamp + idx * 10;
    if (item instanceof RunToolCallItem) {
      const rawCall = item.rawItem;
      if (rawCall.type === "function_call") {
        let parsedArgs: unknown = rawCall.arguments;
        try {
          parsedArgs = JSON.parse(rawCall.arguments);
        } catch {
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
    } else if (item instanceof RunToolCallOutputItem) {
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
  input: any;
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

// ============================================
// Source Normalization
// ============================================

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
      const results = (entry.output as { results?: Array<{ url?: string }> })
        .results;
      if (Array.isArray(results)) {
        for (const result of results) {
          const normalized = normalizeUrl(result?.url);
          if (normalized) {
            urlContextMap.set(normalized, contextId);
          }
        }
      }
    } else if (entry.toolName === "scrape_webpage") {
      const normalized = normalizeUrl((entry.output as { url?: string }).url);
      if (normalized) {
        urlContextMap.set(normalized, contextId);
      }
    }
  }

  return urlContextMap;
}

export function normalizeSourceContextIds(
  sourcesUsed: Array<{
    url?: string;
    contextId?: string;
    type: "search_result" | "scraped_page";
  }>,
  urlContextMap: Map<string, string>,
  isUuidV7: (value: string | undefined) => boolean,
  normalizeUrl: (url: string | undefined) => string | null,
  generateMessageId: () => string,
): {
  normalized: Array<{
    url?: string;
    contextId: string;
    type: "search_result" | "scraped_page";
  }>;
  invalidCount: number;
} {
  const invalidSources: Array<{ url?: string; type: string }> = [];

  const normalized = (sourcesUsed || []).map((source) => {
    let contextId = source.contextId;
    if (!isUuidV7(contextId) && typeof source.url === "string") {
      const normalizedUrl = normalizeUrl(source.url);
      if (normalizedUrl) {
        const mapped = urlContextMap.get(normalizedUrl);
        if (mapped) {
          contextId = mapped;
        }
      }
    }

    if (!contextId || !isUuidV7(contextId)) {
      contextId = generateMessageId();
      invalidSources.push({ url: source.url, type: source.type });
    }

    return {
      ...source,
      contextId,
    };
  });

  return { normalized, invalidCount: invalidSources.length };
}

// (payload signing helper lives in orchestrations.ts to avoid importing node:crypto here)
