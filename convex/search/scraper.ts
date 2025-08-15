/**
 * Web Scraping Module
 * Handles URL content extraction and cleaning
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
      const response = await fetch(args.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SearchChat/1.0; Web Content Reader)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
        redirect: "manual", // Don't auto-follow potential SSRF pivots
      });

      logger.info("📊 Scrape response received:", {
        url: args.url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorDetails = {
          url: args.url,
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        };
        logger.error("❌ HTTP error during scraping:", errorDetails);
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
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
