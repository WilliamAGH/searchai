"use node";

/**
 * Web Scraping Module
 * Handles URL content extraction and cleaning with Cheerio,
 * and optionally falls back to Playwright for JS-rendered pages.
 */

import { load } from "cheerio";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { CACHE_TTL } from "../lib/constants/cache";
import { validateScrapeUrl } from "../lib/url";
import { getErrorMessage } from "../lib/errors";
import {
  extractMainContent,
  extractPageMetadata,
  needsJsRendering,
  normalizeScrapedText,
} from "./scraper_content";
// NOTE: Playwright removed - not compatible with Convex's deployment environment
// (requires native browser binaries that aren't available in Convex runtime)

const MAX_CONTENT_LENGTH = 12000;

export type ScrapeResult = {
  title: string;
  content: string;
  summary?: string;
  needsJsRendering?: boolean;
  // Error fields - present when scrape failed
  error?: string;
  errorCode?: string;
};

type CacheEntry = {
  exp: number;
  val: ScrapeResult;
};

declare global {
  // eslint-disable-next-line no-var
  var __scrapeCache: Map<string, CacheEntry> | undefined;
}

const getScrapeCache = (): Map<string, CacheEntry> => {
  if (!globalThis.__scrapeCache) {
    globalThis.__scrapeCache = new Map<string, CacheEntry>();
  }
  return globalThis.__scrapeCache;
};

export async function scrapeWithCheerio(url: string): Promise<ScrapeResult> {
  const validation = validateScrapeUrl(url);
  if (!validation.ok) {
    return {
      title: "invalid_url",
      content: `Unable to fetch content from ${url}: ${validation.error}`,
      summary: validation.error,
      needsJsRendering: false,
      error: `Invalid URL: ${validation.error}`,
      errorCode: "INVALID_URL",
    };
  }
  const validatedUrl = validation.url;
  const SCRAPE_TTL_MS = CACHE_TTL.SCRAPE_MS;
  const SCRAPE_CACHE_MAX_ENTRIES = 100; // Prevent unbounded memory growth
  const cache = getScrapeCache();
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of cache) {
    if (entry.exp <= now) cache.delete(key);
  }

  const cached = cache.get(validatedUrl);
  if (cached && cached.exp > now) {
    cache.delete(validatedUrl);
    cache.set(validatedUrl, cached);
    return cached.val;
  }

  console.info("🌐 Scraping URL initiated:", {
    url: validatedUrl,
    timestamp: new Date().toISOString(),
  });

  const enforceCapacity = () => {
    while (cache.size > SCRAPE_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  };

  try {
    const response = await fetch(validatedUrl, {
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
    });

    console.info("📊 Scrape response received:", {
      url: validatedUrl,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorDetails = {
        url: validatedUrl,
        status: response.status,
        statusText: response.statusText,
        timestamp: new Date().toISOString(),
      };
      console.error("❌ HTTP error during scraping:", errorDetails);
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    console.info("📄 Content type check:", {
      url,
      contentType: contentType,
    });

    if (!contentType.includes("text/html")) {
      const errorDetails = {
        url: validatedUrl,
        contentType: contentType,
        timestamp: new Date().toISOString(),
      };
      console.error("❌ Non-HTML content type:", errorDetails);
      throw new Error(`Not an HTML page. Content-Type: ${contentType}`);
    }

    const html = await response.text();
    console.info("✅ HTML content fetched:", {
      url: validatedUrl,
      contentLength: html.length,
      timestamp: new Date().toISOString(),
    });

    const $ = load(html);
    const metadata = extractPageMetadata($);
    // Check for JS rendering BEFORE stripJunk removes noscript elements
    const bodyText = normalizeScrapedText($("body").text());
    const needsRender = needsJsRendering($, bodyText.length);
    // Now extract content (which calls stripJunk and removes noscript)
    const extractedContent = extractMainContent($);
    const content =
      extractedContent.length > MAX_CONTENT_LENGTH
        ? `${extractedContent.substring(0, MAX_CONTENT_LENGTH)}...`
        : extractedContent;

    const title =
      metadata.title ||
      metadata.ogTitle ||
      metadata.description ||
      new URL(validatedUrl).hostname;

    // Remove common junk patterns before quality check
    const junkPatterns = [
      /cookie policy/gi,
      /accept cookies/gi,
      /privacy policy/gi,
      /terms of service/gi,
      /subscribe to newsletter/gi,
      /follow us on/gi,
      /share this article/gi,
    ];

    let cleanedContent = content;
    let removedJunkCount = 0;
    for (const pattern of junkPatterns) {
      const matches = cleanedContent.match(pattern);
      if (matches) {
        removedJunkCount += matches.length;
      }
      cleanedContent = cleanedContent.replace(pattern, "");
    }

    // Trim whitespace after junk removal
    cleanedContent = cleanedContent.trim();

    console.log("🗑️ Junk content removed:", {
      url: validatedUrl,
      removedCount: removedJunkCount,
      contentLengthBefore: content.length,
      contentLengthAfter: cleanedContent.length,
    });

    // Filter out low-quality content AFTER junk removal
    if (cleanedContent.length < 100) {
      const errorDetails = {
        url: validatedUrl,
        contentLengthBefore: content.length,
        contentLengthAfter: cleanedContent.length,
        timestamp: new Date().toISOString(),
      };
      console.error("❌ Content too short after junk removal:", errorDetails);
      throw new Error(
        `Content too short after cleaning (${cleanedContent.length} characters)`,
      );
    }

    const summaryLength = Math.min(500, cleanedContent.length);
    const summary =
      cleanedContent.substring(0, summaryLength) +
      (cleanedContent.length > summaryLength ? "..." : "");

    const result: ScrapeResult = {
      title,
      content: cleanedContent,
      summary,
      needsJsRendering: needsRender,
    };

    cache.set(validatedUrl, { exp: Date.now() + SCRAPE_TTL_MS, val: result });
    enforceCapacity();
    console.info("✅ Scraping completed successfully:", {
      url: validatedUrl,
      resultLength: cleanedContent.length,
      summaryLength: summary.length,
      needsJsRendering: needsRender,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    // Classify the error for better diagnostics
    let errorCode = "SCRAPE_FAILED";
    if (errorMessage.includes("HTTP 4")) errorCode = "HTTP_CLIENT_ERROR";
    else if (errorMessage.includes("HTTP 5")) errorCode = "HTTP_SERVER_ERROR";
    else if (errorMessage.includes("timeout")) errorCode = "TIMEOUT";
    else if (errorMessage.includes("Content too short"))
      errorCode = "CONTENT_TOO_SHORT";
    else if (errorMessage.includes("Not an HTML")) errorCode = "NOT_HTML";

    console.error("💥 Scraping failed with exception:", {
      url: validatedUrl,
      error: errorMessage,
      errorCode,
      stack: error instanceof Error ? error.stack : "No stack trace",
      timestamp: new Date().toISOString(),
    });

    let hostname = "";
    try {
      hostname = new URL(validatedUrl).hostname;
    } catch (hostnameError) {
      console.warn("Failed to parse hostname for scrape error", {
        url: validatedUrl,
        error: hostnameError,
      });
      hostname = validatedUrl.substring(0, 50);
    }

    const val: ScrapeResult = {
      title: hostname,
      content: `Unable to fetch content from ${validatedUrl}: ${errorMessage}`,
      summary: `Content unavailable from ${hostname}`,
      needsJsRendering: false,
      // Include error fields so callers can detect and handle failures
      error: errorMessage,
      errorCode,
    };
    // Short TTL for errors to allow retry while preventing hammering
    const ERROR_CACHE_TTL_MS = 30_000; // 30 seconds
    cache.set(validatedUrl, { exp: Date.now() + ERROR_CACHE_TTL_MS, val });
    enforceCapacity();
    return val;
  }
}

/**
 * Scrape and clean web page content (action entry)
 * Uses Cheerio for HTML parsing - Playwright not available in Convex runtime
 */
export const scrapeUrl = action({
  args: { url: v.string() },
  returns: v.object({
    title: v.string(),
    content: v.string(),
    summary: v.optional(v.string()),
    needsJsRendering: v.optional(v.boolean()),
    // Error fields - present when scrape failed
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  }),
  handler: async (_, args): Promise<ScrapeResult> => {
    return await scrapeWithCheerio(args.url);
  },
});
