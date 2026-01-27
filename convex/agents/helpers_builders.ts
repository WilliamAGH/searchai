"use node";

import { buildTemporalHeader } from "../lib/dateTime";
import type { ScrapedContent, SerpEnrichment } from "../lib/types/search";
import {
  formatScrapedContentForPrompt,
  formatSerpEnrichmentForPrompt,
} from "./helpers_formatters";
import { truncate } from "./helpers_utils";

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
  enhancedContext?: string;
  enhancedSystemPrompt?: string;
}): string {
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
  enhancedContext?: string;
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
