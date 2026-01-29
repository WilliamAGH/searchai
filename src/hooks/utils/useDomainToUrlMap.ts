import { useMemo } from "react";
import { getDomainFromUrl } from "@/lib/utils/favicon";

/**
 * Creates a map of domains to URLs from search results for quick lookup.
 * Handles deduplication and domain extraction.
 */
export function useDomainToUrlMap(searchResults: Array<{ url: string }> = []): Map<string, string> {
  return useMemo(() => {
    const map = new Map<string, string>();
    searchResults.forEach((result) => {
      const domain = getDomainFromUrl(result.url);
      if (domain) {
        map.set(domain, result.url);
      }
    });
    return map;
  }, [searchResults]);
}
