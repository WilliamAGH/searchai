"use node";

import type { ScrapedContent, SerpEnrichment } from "../schemas/search";
import { TOKEN_BUDGETS, CONTENT_LIMITS } from "../lib/constants/cache";
import { truncate } from "./helpers_utils";

const CHARS_PER_TOKEN_ESTIMATE = 4;

export function formatScrapedContentForPrompt(
  scrapedContent: ScrapedContent[],
): string {
  if (!scrapedContent?.length) return "";

  const tokensPerPage = Math.min(
    TOKEN_BUDGETS.MAX_TOKENS_PER_PAGE,
    Math.floor(
      TOKEN_BUDGETS.TOTAL_CONTENT_TOKENS / Math.max(scrapedContent.length, 1),
    ),
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
      const summary = page.summary
        ? truncate(page.summary, CONTENT_LIMITS.SUMMARY_TRUNCATE_LENGTH)
        : "";
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
