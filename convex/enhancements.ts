/**
 * Message Enhancement System
 * Provides comprehensive interception and quality improvements for:
 * - User queries
 * - Search requests
 * - Search results
 * - Context building
 * - AI responses
 */

import type { SearchResult } from "./schemas/search";
import { safeParseUrl } from "./lib/url";
import { ENHANCEMENT_RULES } from "./enhancements/rules";

export { extractUrlsFromMessage } from "./lib/url";
export type { EnhancementRule } from "./enhancements/types";
export { ENHANCEMENT_RULES };

// Create search results from user-provided URLs
export function createUserProvidedSearchResults(
  urls: string[],
): SearchResult[] {
  return urls.map((url) => {
    const parsedUrl = safeParseUrl(url);
    if (parsedUrl) {
      return {
        title: `User-provided source: ${parsedUrl.hostname}`,
        url: url,
        snippet: "Source explicitly mentioned by user in their query",
        relevanceScore: 0.95,
      };
    }

    return {
      title: `User-provided source: ${url}`,
      url: url,
      snippet: "Source explicitly mentioned by user in their query",
      relevanceScore: 0.95,
    };
  });
}

/**
 * Apply all matching enhancement rules to a message
 */
export function applyEnhancements(
  message: string,
  options: {
    enhanceQuery?: boolean;
    enhanceSearchTerms?: boolean;
    injectSearchResults?: boolean;
    enhanceContext?: boolean;
    enhanceSystemPrompt?: boolean;
    enhanceResponse?: boolean;
  } = {},
) {
  const sortedRules = [...ENHANCEMENT_RULES]
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.priority - b.priority);

  const matchingRules = sortedRules.filter((rule) => rule.matcher(message));

  const reportableRules = matchingRules.filter(
    (r) => r.id !== "temporal-context",
  );

  const result = {
    matchedRules: reportableRules.map((r) => ({ id: r.id, name: r.name })),
    enhancedQuery: message,
    enhancedSearchTerms: [] as string[],
    injectedResults: [] as SearchResult[],
    enhancedContext: "",
    enhancedSystemPrompt: "",
    prioritizedUrls: [] as string[],
    responseTransformers: [] as Array<(s: string) => string>,
  };

  for (const rule of matchingRules) {
    if (options.enhanceQuery && rule.enhanceQuery) {
      result.enhancedQuery = rule.enhanceQuery(result.enhancedQuery);
    }

    if (options.enhanceSearchTerms && rule.enhanceSearchTerms) {
      const terms = rule.enhanceSearchTerms(result.enhancedSearchTerms);
      result.enhancedSearchTerms.push(...terms);
    }

    if (options.injectSearchResults && rule.injectSearchResults) {
      result.injectedResults.push(...rule.injectSearchResults());
    }

    if (options.enhanceContext && rule.enhanceContext) {
      result.enhancedContext = rule.enhanceContext(result.enhancedContext);
    }

    if (options.enhanceSystemPrompt && rule.enhanceSystemPrompt) {
      result.enhancedSystemPrompt = rule.enhanceSystemPrompt(
        result.enhancedSystemPrompt,
      );
    }

    if (rule.prioritizeUrls) {
      result.prioritizedUrls.push(...rule.prioritizeUrls);
    }

    if (options.enhanceResponse && rule.enhanceResponse) {
      result.responseTransformers.push(rule.enhanceResponse);
    }
  }

  result.enhancedSearchTerms = [...new Set(result.enhancedSearchTerms)];
  result.prioritizedUrls = [...new Set(result.prioritizedUrls)];

  return result;
}

/**
 * Check if a URL should be prioritized for scraping
 */
export function shouldPrioritizeUrl(
  url: string,
  prioritizedUrls: string[],
): boolean {
  const u = safeParseUrl(url);
  if (!u) return false;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return prioritizedUrls.some((p) => {
    const pu = safeParseUrl(p.startsWith("http") ? p : `https://${p}`);
    if (pu) {
      const phost = pu.hostname.toLowerCase().replace(/^www\./, "");
      return host === phost || u.origin === pu.origin;
    }
    return host.endsWith(p.toLowerCase().replace(/^www\./, ""));
  });
}

/**
 * Sort search results with prioritized URLs first
 */
export function sortResultsWithPriority<
  T extends { url: string; relevanceScore?: number },
>(results: T[], prioritizedUrls: string[]): T[] {
  return [...results].sort((a, b) => {
    const aPriority = shouldPrioritizeUrl(a.url, prioritizedUrls);
    const bPriority = shouldPrioritizeUrl(b.url, prioritizedUrls);

    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;

    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });
}
