/**
 * Shared search constants.
 * Single source of truth for search methods and source kinds.
 */

/**
 * Available search provider methods.
 * Used by vSearchMethod validator (validators.ts) and Zod schemas (schemas/search.ts).
 */
export const SEARCH_METHODS = ["serp", "openrouter", "duckduckgo", "fallback"] as const;

export type SearchMethod = (typeof SEARCH_METHODS)[number];

/** Source kind values - shared between SearchResult and ScrapedContent */
export const SOURCE_KINDS = ["search_result", "scraped_page"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
