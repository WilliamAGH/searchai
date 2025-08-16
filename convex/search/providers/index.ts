/**
 * Search Provider Exports
 * Consolidates all search provider functions
 *
 * This file exports a unified SearchResult interface that includes all possible fields
 * from all search providers, ensuring schema consistency across the application.
 */

// Create a unified SearchResult type that includes all possible fields from all providers
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
  // Optional scraped content fields
  content?: string; // Full scraped content
  fullTitle?: string; // Title from scraped page
  summary?: string; // Summary from scraped content
}

export { searchWithSerpApi } from "./serpapi";
export { searchWithDuckDuckGo } from "./duckduckgo";
export { searchWithOpenRouter } from "./openrouter";
