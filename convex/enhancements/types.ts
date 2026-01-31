import type { SearchResult } from "../schemas/search";

/**
 * Enhancement rule that can modify various aspects of the message pipeline
 */
export interface EnhancementRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // Lower numbers = higher priority

  // Matchers
  matcher: (message: string) => boolean;

  // Enhancements
  enhanceQuery?: (query: string) => string;
  enhanceSearchTerms?: (terms: string[]) => string[];
  injectSearchResults?: () => SearchResult[];
  enhanceContext?: (context: string) => string;
  enhanceSystemPrompt?: (prompt: string) => string;
  enhanceResponse?: (content: string) => string;
  prioritizeUrls?: string[];
}
