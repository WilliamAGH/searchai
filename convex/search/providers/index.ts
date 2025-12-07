/**
 * Search Provider Exports
 * Consolidates all search provider functions
 */

export { searchWithSerpApiDuckDuckGo } from "./serpapi";
export type {
  SearchResult,
  SearchProviderResult,
} from "../../lib/types/search";
export { searchWithOpenRouter } from "./openrouter";
export { searchWithDuckDuckGo } from "./duckduckgo";
