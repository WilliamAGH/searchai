/**
 * Web Scraping Module
 * Handles URL content extraction and cleaning
 */

/**
 * TODO: CRITICAL IMPROVEMENTS NEEDED FOR LARGE CONTEXT HANDLING
 * 
 * Current limitation: We truncate scraped content to 2000 chars in buildSystemPrompt()
 * This loses valuable context that could improve response quality.
 * 
 * REQUIRED ENHANCEMENTS:
 * 
 * a) INTELLIGENT CONTENT EXTRACTION
 *    - Analyze user query to determine relevance/intent keywords
 *    - Use query-aware extraction to identify and prioritize relevant sections
 *    - Remove boilerplate (nav, footers, ads, sidebars) more aggressively
 *    - Extract based on semantic relevance to the user's question
 *    - Consider using DOM structure analysis to identify main content areas
 * 
 * b) ADVANCED CONTEXT COMPRESSION
 *    - Implement chunking strategy for documents > 2000 chars
 *    - Use vector embeddings to identify most relevant chunks
 *    - Apply semantic compression/summarization per chunk
 *    - Maintain key facts, data points, and citations
 *    - Consider using a local embedding model or Convex vector search
 *    - Preserve technical details, numbers, dates, and proper nouns
 *    - Could use techniques like:
 *      * Extractive summarization (key sentence selection)
 *      * Semantic similarity scoring against query
 *      * TF-IDF or BM25 for relevance ranking
 *      * Hierarchical content structuring
 * 
 * c) PERSISTENT CACHING LAYER
 *    - Create new Convex table: "scraped_content" with schema:
 *      {
 *        url: string (indexed),
 *        domain: string,
 *        title: string,
 *        rawContent: string,
 *        processedContent: string,
 *        summary: string,
 *        keyPoints: string[],
 *        embeddings?: float[], // For vector search
 *        queryRelevance: Map<queryHash, relevanceScore>,
 *        scrapedAt: number,
 *        contentHash: string, // For change detection
 *        contentLength: number,
 *        language: string,
 *        contentType: string // article, documentation, forum, etc.
 *      }
 *    - Implement TTL-based expiration (e.g., 7 days for news, 30 days for docs)
 *    - Store both raw and processed versions
 *    - Enable query-specific caching of relevance scores
 *    - Support incremental updates when content changes
 * 
 * IMPLEMENTATION PRIORITY:
 * 1. Start with persistent caching to reduce redundant scraping
 * 2. Add query-aware extraction for better relevance
 * 3. Implement compression/summarization for large documents
 * 4. Finally add vector embeddings for semantic search
 * 
 * EXPECTED BENEFITS:
 * - 10x more context available to LLM per source
 * - Faster responses due to caching
 * - Better answer quality with relevant content extraction
 * - Reduced API costs by avoiding redundant scraping
 * - Support for long-form technical documentation
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { logger } from "../lib/logger";

// SSRF Protection: Block private IP ranges and localhost
const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
];
const PRIVATE_IPV6 = [/^\[?::1\]?/, /^\[?fc00:/i, /^\[?fe80:/i];

function isSafeUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (!/^https?:$/.test(u.protocol))
    return { ok: false, reason: "Protocol not allowed" };
  const host = u.hostname.toLowerCase();

  // Block localhost-ish
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return { ok: false, reason: "Localhost blocked" };
  }
  // Block obvious private IPv4
  if (PRIVATE_IPV4.some((re) => re.test(host)))
    return { ok: false, reason: "Private IPv4 blocked" };
  // Block obvious private IPv6
  if (PRIVATE_IPV6.some((re) => re.test(host)))
    return { ok: false, reason: "Private IPv6 blocked" };

  // Optional: block link-local hostnames commonly used internally
  const internalish = [
    "intranet",
    "corp",
    "internal",
    "lan",
    "home",
    "localdomain",
  ];
  if (internalish.some((s) => host.endsWith(`.${s}`))) {
    return { ok: false, reason: "Internal hostname blocked" };
  }
  return { ok: true };
}

/**
 * Scrape and clean web page content
 * - Extracts title from <title> or <h1>
 * - Removes scripts/styles/HTML
 * - Filters junk patterns
 * - Truncates to 5000 chars
 * - 10s timeout
 * @param url - Absolute URL to fetch
 * @returns {title, content, summary}
 */
export const scrapeUrl = internalAction({
  args: { url: v.string() },
  returns: v.object({
    title: v.string(),
    content: v.string(),
    summary: v.optional(v.string()),
  }),
  handler: async (
    _,
    args,
  ): Promise<{
    title: string;
    content: string;
    summary?: string;
  }> => {
    // SSRF Protection: Validate URL before fetching
    const safety = isSafeUrl(args.url);
    if (!safety.ok) {
      logger.warn("🚫 Blocked unsafe scrape URL", {
        url: args.url,
        reason: safety.reason,
      });
      throw new Error(`Unsafe URL: ${safety.reason}`);
    }

    // Handle known problematic sites early
    const hostname = new URL(args.url).hostname.toLowerCase();
    if (hostname.includes("reddit.com")) {
      logger.info("🚫 Skipping Reddit scraping (blocked by Reddit)", {
        url: args.url,
      });
      return {
        title: "Reddit Content",
        content:
          "Reddit blocks automated scraping. Please visit the link directly to view the content.",
        summary: "Reddit content (scraping blocked)",
      };
    }

    // Short-TTL in-process cache to avoid repeat scrapes across adjacent queries
    const SCRAPE_TTL_MS = 2 * 60 * 1000; // 2 minutes
    const globalAny: any = globalThis as any;
    if (!globalAny.__scrapeCache)
      globalAny.__scrapeCache = new Map<
        string,
        {
          exp: number;
          val: { title: string; content: string; summary?: string };
        }
      >();
    const cache: Map<
      string,
      { exp: number; val: { title: string; content: string; summary?: string } }
    > = globalAny.__scrapeCache;
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.exp <= now) cache.delete(k);
    }
    const hit = cache.get(args.url);
    if (hit && hit.exp > now) {
      return hit.val;
    }
    logger.info("🌐 Scraping URL initiated:", {
      url: args.url,
      timestamp: new Date().toISOString(),
    });

    try {
      // First attempt with manual redirect to check for redirects
      let response = await fetch(args.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
        redirect: "manual", // Check for redirects first
      });

      logger.info("📊 Scrape response received:", {
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      // Handle redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (location) {
          logger.info("🔄 Following redirect:", {
            from: args.url,
            to: location,
            status: response.status,
          });

          // Resolve relative URLs
          const redirectUrl = new URL(location, args.url).toString();

          // Validate the redirect URL for SSRF protection
          const redirectSafety = isSafeUrl(redirectUrl);
          if (!redirectSafety.ok) {
            logger.warn("🚫 Blocked unsafe redirect URL", {
              url: redirectUrl,
              reason: redirectSafety.reason,
            });
            throw new Error(`Unsafe redirect URL: ${redirectSafety.reason}`);
          }

          // Follow the redirect
          response = await fetch(redirectUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
              "Accept-Encoding": "gzip, deflate",
              Connection: "keep-alive",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "follow", // Allow further redirects
          });
        }
      }

      // Handle various error status codes more gracefully
      if (response.status === 403) {
        logger.warn("⚠️ Access forbidden (403):", { url: args.url });
        return {
          title: hostname,
          content: `Access to ${hostname} is restricted. The site has blocked automated access.`,
          summary: `Content unavailable from ${hostname} (access restricted)`,
        };
      }

      if (response.status === 404) {
        logger.warn("⚠️ Page not found (404):", { url: args.url });
        return {
          title: hostname,
          content: `Page not found at ${args.url}`,
          summary: "Page not found (404)",
        };
      }

      if (!response.ok) {
        const errorDetails = {
          url: args.url,
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        };
        logger.error("❌ HTTP error during scraping:", errorDetails);
        // Return graceful fallback instead of throwing
        return {
          title: hostname,
          content: `Unable to fetch content from ${hostname} (HTTP ${response.status})`,
          summary: `Content unavailable (HTTP ${response.status})`,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      logger.info("📄 Content type check:", {
        url: args.url,
        contentType: contentType,
      });

      if (!contentType.includes("text/html")) {
        const errorDetails = {
          url: args.url,
          contentType: contentType,
          timestamp: new Date().toISOString(),
        };
        logger.error("❌ Non-HTML content type:", errorDetails);
        throw new Error(`Not an HTML page. Content-Type: ${contentType}`);
      }

      const html = await response.text();
      logger.info("✅ HTML content fetched:", {
        url: args.url,
        contentLength: html.length,
        timestamp: new Date().toISOString(),
      });

      // Extract title using regex
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      let title = titleMatch ? titleMatch[1].trim() : "";

      // Try h1 if no title
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (!title) {
        title = h1Match ? h1Match[1].trim() : new URL(args.url).hostname;
      }

      logger.info("🏷️ Title extracted:", {
        url: args.url,
        title: title,
        method: titleMatch ? "title tag" : h1Match ? "h1 tag" : "hostname",
      });

      // Remove script and style tags, then extract text content
      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      logger.info("🧹 Content cleaned:", {
        url: args.url,
        originalLength: html.length,
        cleanedLength: content.length,
      });

      // Filter out low-quality content
      if (content.length < 100) {
        const errorDetails = {
          url: args.url,
          contentLength: content.length,
          timestamp: new Date().toISOString(),
        };
        logger.error("❌ Content too short after cleaning:", errorDetails);
        throw new Error(`Content too short (${content.length} characters)`);
      }

      // Remove common junk patterns
      const junkPatterns = [
        /cookie policy/gi,
        /accept cookies/gi,
        /privacy policy/gi,
        /terms of service/gi,
        /subscribe to newsletter/gi,
        /follow us on/gi,
        /share this article/gi,
      ];

      let removedJunkCount = 0;
      for (const pattern of junkPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          removedJunkCount += matches.length;
        }
        content = content.replace(pattern, "");
      }

      logger.debug("🗑️ Junk content removed:", {
        url: args.url,
        removedCount: removedJunkCount,
      });

      // Limit content length
      if (content.length > 5000) {
        content = `${content.substring(0, 5000)}...`;
        logger.info("✂️ Content truncated:", {
          url: args.url,
          newLength: content.length,
        });
      }

      // Generate summary (first few sentences)
      const summaryLength = Math.min(500, content.length);
      const summary =
        content.substring(0, summaryLength) +
        (content.length > summaryLength ? "..." : "");

      const result = { title, content, summary };
      cache.set(args.url, { exp: Date.now() + SCRAPE_TTL_MS, val: result });
      logger.info("✅ Scraping completed successfully:", {
        url: args.url,
        resultLength: content.length,
        summaryLength: summary.length,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      logger.error("💥 Scraping failed with exception:", {
        url: args.url,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : "No stack trace",
        timestamp: new Date().toISOString(),
      });

      let hostname = "";
      try {
        hostname = new URL(args.url).hostname;
      } catch {
        hostname = "unknown";
      }
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      const val = {
        title: hostname,
        content: `Unable to fetch content from ${args.url}: ${errorMessage}`,
        summary: `Content unavailable from ${hostname}`,
      };
      cache.set(args.url, { exp: Date.now() + SCRAPE_TTL_MS, val });
      return val;
    }
  },
});
