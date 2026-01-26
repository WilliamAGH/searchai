"use node";

import {
  safeParsePlanResearchToolOutput,
  safeParseScrapeToolOutput,
  safeParseSearchToolOutput,
  type ResearchContextReference,
} from "./schema";
import { buildTemporalHeader } from "../lib/dateTime";
import type { ScrapedContent, SerpEnrichment } from "../lib/types/search";
import { normalizeUrl as normalizeUrlUtil } from "../lib/url";
import { RELEVANCE_SCORES } from "../lib/constants/cache";

/**
 * Shared helper functions for agent orchestration
 * These are extracted to avoid duplication between streaming and non-streaming workflows
 */

// ============================================
// Constants and Utilities
// ============================================

/**
 * UUID v7 validation pattern - duplicated from lib/uuid.ts for bundle optimization.
 * @see {@link ../lib/uuid.ts:isValidUuidV7} - canonical implementation
 */
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_RESULT_MAX_LENGTH = 200;
const TOTAL_CONTENT_TOKEN_BUDGET = 12000;
const MAX_TOKENS_PER_PAGE = 3000;
const CHARS_PER_TOKEN_ESTIMATE = 4;

export const isUuidV7 = (value: string | undefined): boolean =>
  !!value && UUID_V7_REGEX.test(value);

/**
 * Convert numeric relevance score to human-readable label.
 * Uses centralized thresholds from RELEVANCE_SCORES constants.
 *
 * @param score - Relevance score (0-1), or undefined
 * @returns "high" | "medium" | "low" based on threshold comparison
 */
export function relevanceScoreToLabel(
  score: number | undefined,
): "high" | "medium" | "low" {
  const s = score ?? 0;
  if (s >= RELEVANCE_SCORES.HIGH_THRESHOLD) return "high";
  if (s >= RELEVANCE_SCORES.MEDIUM_THRESHOLD) return "medium";
  return "low";
}

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
    // Log serialization failure for debugging (circular refs, BigInt, etc.)
    console.warn("Tool result serialization failed", {
      outputType: typeof output,
      error:
        serializeError instanceof Error
          ? serializeError.message
          : String(serializeError),
    });
    return "[unserializable output]";
  }
};

export const normalizeUrl = normalizeUrlUtil;

const truncate = (text: string, maxChars: number): string =>
  text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;

export function formatScrapedContentForPrompt(
  scrapedContent: ScrapedContent[],
): string {
  if (!scrapedContent?.length) return "";

  const tokensPerPage = Math.min(
    MAX_TOKENS_PER_PAGE,
    Math.floor(TOTAL_CONTENT_TOKEN_BUDGET / Math.max(scrapedContent.length, 1)),
  );
  const charsPerPage = tokensPerPage * CHARS_PER_TOKEN_ESTIMATE;

  return scrapedContent
    .slice()
    .sort(
      (a, b) =>
        (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
        (b.contentLength ?? b.content.length) -
          (a.contentLength ?? a.content.length),
    )
    .map((page, idx) => {
      const safeContent = page.content || "";
      const excerpt = truncate(safeContent, charsPerPage);
      const summary = page.summary ? truncate(page.summary, 500) : "";
      return `#${idx + 1} ${page.title || "Untitled"}
URL: ${page.url}
ContextId: ${page.contextId ?? "n/a"}
Content (truncated to ~${charsPerPage} chars): ${excerpt}
Summary: ${summary}`;
    })
    .join("\n\n---\n\n");
}

export function formatSerpEnrichmentForPrompt(
  enrichment: SerpEnrichment | undefined,
): string {
  if (!enrichment) return "";
  const lines: string[] = [];

  if (enrichment.knowledgeGraph) {
    const kg = enrichment.knowledgeGraph;
    lines.push(
      `Knowledge Graph: ${kg.title || "N/A"} (${kg.type || "unknown"})`,
    );
    if (kg.description) {
      lines.push(`Description: ${kg.description}`);
    }
    if (kg.url) {
      lines.push(`URL: ${kg.url}`);
    }
    if (kg.attributes && Object.keys(kg.attributes).length > 0) {
      const attrs = Object.entries(kg.attributes)
        .map(([k, v]) => `${k}: ${v ?? ""}`)
        .join("; ");
      lines.push(`Attributes: ${attrs}`);
    }
  }

  if (enrichment.answerBox) {
    const ab = enrichment.answerBox;
    lines.push(
      `Answer Box (${ab.type || "general"}): ${ab.answer || ab.snippet || "N/A"}`,
    );
    if (ab.source || ab.url) {
      lines.push(`Answer Source: ${ab.source || ab.url}`);
    }
  }

  if (enrichment.peopleAlsoAsk?.length) {
    lines.push(
      `People Also Ask: ${enrichment.peopleAlsoAsk
        .map((q) => `${q.question}${q.snippet ? ` - ${q.snippet}` : ""}`)
        .join(" | ")}`,
    );
  }

  if (enrichment.relatedQuestions?.length) {
    lines.push(
      `Related Questions: ${enrichment.relatedQuestions
        .map((q) => `${q.question}${q.snippet ? ` - ${q.snippet}` : ""}`)
        .join(" | ")}`,
    );
  }

  if (enrichment.relatedSearches?.length) {
    lines.push(`Related Searches: ${enrichment.relatedSearches.join(" | ")}`);
  }

  return lines.join("\n");
}

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
  /** Authoritative context that should guide research focus */
  enhancedContext?: string;
  /** System-level instructions from enhancement rules */
  enhancedSystemPrompt?: string;
}): string {
  // If authoritative context is provided, add disambiguation guidance
  const authoritativeSection = params.enhancedContext
    ? `
⚠️ CRITICAL DISAMBIGUATION CONTEXT ⚠️
The following authoritative information is KNOWN to be relevant to this query.
When researching, PRIORITIZE sources that align with this context.
If web results conflict with this authoritative information, favor the authoritative source.

${params.enhancedContext}

---

`
    : "";

  // Temporal/system context should be at the TOP so LLM sees it before search queries
  const temporalSection = params.enhancedSystemPrompt
    ? `${params.enhancedSystemPrompt}

---

`
    : "";

  return `${temporalSection}ORIGINAL QUESTION: ${params.userQuery}

USER INTENT: ${params.userIntent}

${authoritativeSection}${params.conversationBlock}${params.referenceBlock ? `${params.referenceBlock}\n\n` : ""}INFORMATION NEEDED:
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
- Note any information gaps or conflicting data${params.enhancedContext ? "\n- PRIORITIZE authoritative context over generic web results" : ""}
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
  scrapedContent?: ScrapedContent[];
  serpEnrichment?: SerpEnrichment;
  /** Injected context from enhancement rules (e.g., founder/creator info) */
  enhancedContext?: string;
  /** System-level instructions from enhancement rules */
  enhancedSystemPrompt?: string;
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
        } catch (error) {
          console.warn("Failed to parse source URL for synthesis prompt", {
            url: source.url,
            error,
          });
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

  if (params.scrapedContent?.length) {
    console.log("📄 SCRAPED CONTENT FOR SYNTHESIS:", {
      pageCount: params.scrapedContent.length,
      totalChars: params.scrapedContent.reduce(
        (sum, p) => sum + (p.content?.length || 0),
        0,
      ),
      pages: params.scrapedContent.map((p) => ({
        url: p.url,
        contentPreview: truncate(p.content || "", 200),
      })),
    });
  }

  const scrapedSection = params.scrapedContent?.length
    ? `SCRAPED CONTENT (use these excerpts for citations):
${formatScrapedContentForPrompt(params.scrapedContent)}
`
    : "";

  const serpSection = params.serpEnrichment
    ? `SERP ENRICHMENT:
${formatSerpEnrichmentForPrompt(params.serpEnrichment)}
`
    : "";

  // Enhancement context takes priority - it contains authoritative overrides
  // (e.g., founder/creator info that may not appear in web search results)
  const enhancementSection = params.enhancedContext
    ? `
════════════════════════════════════════════════════════════════════════════════
⚠️  MANDATORY AUTHORITATIVE CONTEXT - THIS OVERRIDES WEB SEARCH RESULTS  ⚠️
════════════════════════════════════════════════════════════════════════════════

The following is VERIFIED, AUTHORITATIVE information that MUST be used as the
PRIMARY basis for your answer. If web search results conflict with this context,
IGNORE the conflicting web results and USE THIS INFORMATION INSTEAD.

${params.enhancedContext}

════════════════════════════════════════════════════════════════════════════════

`
    : "";

  // System-level instructions from enhancements
  const systemInstructions = params.enhancedSystemPrompt
    ? `

═══ CRITICAL RESPONSE REQUIREMENTS ═══
${params.enhancedSystemPrompt}
═══════════════════════════════════════`
    : "";

  return `
ORIGINAL QUESTION: ${params.userQuery}

USER INTENT: ${params.userIntent}

${enhancementSection}RESEARCH FINDINGS:

${params.researchSummary}

KEY FACTS:
${params.keyFindings
  .map(
    (finding, i) => `${i + 1}. ${finding.finding}
   Sources: ${finding.sources.join(", ")}
   Confidence: ${finding.confidence}`,
  )
  .join("\n\n")}

${scrapedSection}${serpSection}SOURCES AVAILABLE:
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
6. Prefer scraped content excerpts when available; use SERP enrichment as supplemental context
7. PRIORITIZE authoritative context over web search results when available
8. DO NOT add a separate "Sources:" section at the end - cite inline only
9. When showing URLs, NEVER include "https://" or "http://" prefixes - use bare domain format (example.com/path)${systemInstructions}

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
        } catch (error) {
          console.warn("Failed to parse context reference URL", {
            url: ref.url,
            error,
          });
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
      src.relevance === "high"
        ? RELEVANCE_SCORES.HIGH_LABEL
        : src.relevance === "medium"
          ? RELEVANCE_SCORES.MEDIUM_LABEL
          : RELEVANCE_SCORES.LOW_LABEL,
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
