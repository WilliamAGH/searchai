/**
 * Web Research Sources (Domain + UI Adapter)
 *
 * Canonical persisted domain object: `WebResearchSource[]` (Convex + Zod).
 * UI projection: `WebSourceCard[]` (derived-only; never persisted).
 *
 * This module is the single mapping path between the two.
 */

import {
  getDomainFromUrl,
  getSafeHostname,
  safeParseHttpUrl,
} from "@/lib/utils/favicon";
import { logger } from "@/lib/logger";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

export type WebSourceCard = {
  url: string;
  title: string;
  type?: WebResearchSourceClient["type"];
  relevanceScore?: number;
  metadata?: WebResearchSourceClient["metadata"];
};

function isFailureMetadata(
  metadata: WebResearchSourceClient["metadata"] | undefined,
): boolean {
  return (
    metadata?.crawlAttempted === true && metadata?.crawlSucceeded === false
  );
}

function isLowRelevanceMetadata(
  metadata: WebResearchSourceClient["metadata"] | undefined,
): boolean {
  return metadata?.markedLowRelevance === true;
}

function getSourceCardPriority(card: WebSourceCard): number {
  if (card.type === "scraped_page") return 4;
  if (isFailureMetadata(card.metadata)) return 3;
  if (isLowRelevanceMetadata(card.metadata)) return 2;
  if (card.type === "search_result") return 1;
  return 0;
}

export function toNormalizedUrlKey(rawUrl: string): string | null {
  const u = safeParseHttpUrl(rawUrl);
  if (!u) {
    logger.warn("toNormalizedUrlKey: URL rejected during normalization", {
      url: rawUrl.trim(),
    });
    return null;
  }

  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

export function hasWebResearchSources(
  webResearchSources: WebResearchSourceClient[] | undefined,
): boolean {
  return (
    Array.isArray(webResearchSources) &&
    webResearchSources.some(
      (s) => s && typeof s.url === "string" && s.url.length > 0,
    )
  );
}

export function toWebSourceCards(
  webResearchSources: WebResearchSourceClient[] | undefined,
): WebSourceCard[] {
  if (!Array.isArray(webResearchSources)) return [];

  const withUrls = webResearchSources.filter(
    (s): s is WebResearchSourceClient & { url: string } =>
      !!s && typeof s.url === "string" && s.url.length > 0,
  );

  const byUrl = new Map<string, WebSourceCard>();
  for (const src of withUrls) {
    const key = toNormalizedUrlKey(src.url);
    if (!key) continue;

    const fallbackTitle = getSafeHostname(src.url) || "Source";
    const nextCard: WebSourceCard = {
      url: src.url,
      title: src.title || fallbackTitle,
      type: src.type,
      relevanceScore: src.relevanceScore,
      metadata: src.metadata,
    };
    const existingCard = byUrl.get(key);
    if (!existingCard) {
      byUrl.set(key, nextCard);
      continue;
    }

    if (getSourceCardPriority(nextCard) > getSourceCardPriority(existingCard)) {
      byUrl.set(key, nextCard);
    }
  }

  return Array.from(byUrl.values());
}

export function toDomainToUrlMap(
  webResearchSources: WebResearchSourceClient[] | undefined,
): Map<string, string> {
  const cards = toWebSourceCards(webResearchSources);
  const map = new Map<string, string>();

  for (const c of cards) {
    const hostname = getDomainFromUrl(c.url);
    if (!hostname) {
      logger.warn("Skipped source with unparseable URL in domain map", {
        url: c.url,
      });
      continue;
    }
    // Prefer first-seen URL per domain for stable mapping.
    if (!map.has(hostname)) {
      map.set(hostname, c.url);
    }
  }

  return map;
}
