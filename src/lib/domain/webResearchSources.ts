/**
 * Web Research Sources (Domain + UI Adapter)
 *
 * Canonical persisted domain object: `WebResearchSource[]` (Convex + Zod).
 * UI projection: `WebSourceCard[]` (derived-only; never persisted).
 *
 * This module is the single mapping path between the two.
 */

import { getDomainFromUrl, getSafeHostname } from "@/lib/utils/favicon";
import { logger } from "@/lib/logger";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

export type WebSourceCard = {
  url: string;
  title: string;
  type?: WebResearchSourceClient["type"];
  relevanceScore?: number;
};

function normalizeUrlKey(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  const normalized = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  try {
    const u = new URL(normalized);
    u.hash = "";
    // Lightweight normalization: remove common www and trailing slash.
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch (error) {
    logger.warn("normalizeUrlKey: rejected unparseable URL", {
      url: trimmed,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
    const key = normalizeUrlKey(src.url);
    if (!key || byUrl.has(key)) continue;

    const fallbackTitle = getSafeHostname(src.url) || "Source";
    byUrl.set(key, {
      url: src.url,
      title: src.title || fallbackTitle,
      type: src.type,
      relevanceScore: src.relevanceScore,
    });
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
      if (import.meta.env.DEV) {
        logger.debug("Skipped invalid source URL for domain map", {
          url: c.url,
        });
      }
      continue;
    }
    // Prefer first-seen URL per domain for stable mapping.
    if (!map.has(hostname)) {
      map.set(hostname, c.url);
    }
  }

  return map;
}
