import { useMemo } from "react";
import { getDomainFromUrl } from "../../lib/utils/favicon";
import { logger } from "../../lib/logger";

/**
 * Hook to process content and replace citations with interactive markers
 * Centralizes the logic for handling markdown links and citation patterns
 */
export function useCitationProcessor(
  content: string,
  searchResults: Array<{ url: string }> = [],
  domainToUrlMap: Map<string, string>,
): string {
  return useMemo(() => {
    // Replace [domain.com] or [full URL] with custom markers that survive markdown processing
    // Updated regex to capture potential following (url) part of a markdown link
    // This handles cases where LLM outputs [domain.com](url) - we want to consume the whole thing
    const citationRegex = /\[([^\]]+)\](?:\(([^)]+)\))?/g;

    return content.replace(citationRegex, (match, citedText, existingUrl) => {
      let domain = citedText;
      let url: string | undefined;

      // If matches a full markdown link [text](url), use the existing URL if valid
      if (existingUrl) {
        url = existingUrl;
        // Try to get a cleaner domain for display from the link text or the URL
        const extractedDomain = getDomainFromUrl(existingUrl);
        if (
          extractedDomain &&
          (citedText.includes(extractedDomain) ||
            citedText === existingUrl ||
            citedText.startsWith("http"))
        ) {
          domain = extractedDomain;
        } else {
          // If the link text is something else (e.g. "here"), keep it or use domain?
          // For citations, we usually want the domain.
          // If citedText looks like a URL or domain, normalize it.
          if (citedText.includes(".") && !citedText.includes(" ")) {
            domain = getDomainFromUrl(citedText) || citedText;
          }
        }
      } else {
        // Check if cited text is a full URL
        if (
          citedText.startsWith("http://") ||
          citedText.startsWith("https://")
        ) {
          // Extract domain from the full URL citation
          try {
            domain = new URL(citedText).hostname.replace("www.", "");
            // Try to find exact URL match first
            const exactMatch = searchResults?.find((r) => r.url === citedText);
            if (exactMatch) {
              url = exactMatch.url;
            } else {
              // Fallback to domain matching
              url = domainToUrlMap.get(domain);
            }
          } catch (error) {
            logger.warn("Failed to parse cited URL for markdown citation", {
              citedText,
              error,
            });
            url = domainToUrlMap.get(citedText);
          }
        } else if (citedText.includes("/")) {
          // Handle cases like "github.com/user/repo" - extract just the domain
          const domainPart = citedText.split("/")[0];
          domain = domainPart;
          // Look for any URL from this domain
          url = domainToUrlMap.get(domain);
          // If not found, try to find a URL that contains this path
          if (!url) {
            const matchingResult = searchResults?.find(
              (r) =>
                r.url.includes(citedText) ||
                (r.url.includes(domain) && r.url.includes("/")),
            );
            if (matchingResult) {
              url = matchingResult.url;
            }
          }
        } else {
          // Simple domain citation
          url = domainToUrlMap.get(citedText);
          domain = citedText;
        }
      }

      if (url) {
        // Use a special marker that won't be escaped by markdown
        return `@@CITATION@@${domain}@@${url}@@`;
      }
      return match;
    });
  }, [content, domainToUrlMap, searchResults]);
}
