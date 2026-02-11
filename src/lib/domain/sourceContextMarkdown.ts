import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Build a copyable markdown snapshot from the persisted source record.
 *
 * Use this when full harvested server markdown was not persisted on the source.
 * It still reflects server-side Convex source data stored with the message.
 */
export function buildSourceRecordSnapshotMarkdown(source: {
  contextId?: string;
  url: string;
  title: string;
  type?: WebResearchSourceClient["type"];
  relevanceScore?: number;
  metadata?: WebResearchSourceClient["metadata"];
}): string {
  const metadata = source.metadata;
  const crawlAttempted =
    metadata?.crawlAttempted ?? (source.type === "scraped_page" ? true : null);
  const crawlSucceeded =
    metadata?.crawlSucceeded ?? (source.type === "scraped_page" ? true : null);
  const crawlErrorMessage = metadata?.crawlErrorMessage;
  const markedLowRelevance = metadata?.markedLowRelevance;
  const relevanceThreshold = metadata?.relevanceThreshold;
  const scrapedBodyContent =
    typeof metadata?.scrapedBodyContent === "string"
      ? metadata.scrapedBodyContent
      : undefined;
  const scrapedBodyContentLength = isNumber(metadata?.scrapedBodyContentLength)
    ? metadata.scrapedBodyContentLength
    : scrapedBodyContent?.length;

  return [
    "## Convex Source Record Snapshot",
    "- sourceSnapshotType: persisted_web_research_source",
    `- contextId: ${source.contextId ?? "unknown"}`,
    `- url: ${source.url}`,
    `- title: ${source.title || "Untitled"}`,
    `- type: ${source.type ?? "unknown"}`,
    `- relevanceScore: ${source.relevanceScore ?? "unknown"}`,
    `- fullHarvestedContextPersisted: ${typeof metadata?.serverContextMarkdown === "string" && metadata.serverContextMarkdown.length > 0 ? "true" : "false"}`,
    "",
    "### Crawl Metadata",
    `- crawlAttempted: ${isBoolean(crawlAttempted) ? String(crawlAttempted) : "unknown"}`,
    `- crawlSucceeded: ${isBoolean(crawlSucceeded) ? String(crawlSucceeded) : "unknown"}`,
    `- crawlErrorMessage: ${typeof crawlErrorMessage === "string" && crawlErrorMessage.length > 0 ? crawlErrorMessage : "none"}`,
    `- markedLowRelevance: ${isBoolean(markedLowRelevance) ? String(markedLowRelevance) : "unknown"}`,
    `- relevanceThreshold: ${isNumber(relevanceThreshold) ? String(relevanceThreshold) : "unknown"}`,
    "",
    "### Scraped Body Content",
    `- scrapedBodyContentPresent: ${scrapedBodyContent ? "true" : "false"}`,
    `- scrapedBodyContentLength: ${isNumber(scrapedBodyContentLength) ? String(scrapedBodyContentLength) : "unknown"}`,
    ...(scrapedBodyContent ? ["", "```text", scrapedBodyContent, "```"] : []),
  ].join("\n");
}
