"use node";

/**
 * Web Scraping Module
 * Handles URL content extraction and cleaning with Cheerio,
 * and optionally falls back to Playwright for JS-rendered pages.
 */

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { CACHE_TTL } from "../lib/constants/cache";
// NOTE: Playwright removed - not compatible with Convex's deployment environment
// (requires native browser binaries that aren't available in Convex runtime)

const MAX_CONTENT_LENGTH = 12000;

export type ScrapeResult = {
  title: string;
  content: string;
  summary?: string;
  needsJsRendering?: boolean;
};

const cleanText = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

const stripJunk = ($: CheerioAPI) => {
  $("script, style, nav, footer, header, aside, noscript, iframe").remove();
  $('[aria-hidden="true"]').remove();
  $('[role="presentation"]').remove();
  $(".ads, .ad, .advertisement, .promo, .sidebar").remove();
};

const extractPageMetadata = ($: CheerioAPI) => {
  const fallbackTitle =
    $("h1").first().text().trim() || $("h2").first().text().trim();
  return {
    title: $("title").text().trim() || fallbackTitle,
    description: $('meta[name="description"]').attr("content"),
    ogTitle: $('meta[property="og:title"]').attr("content"),
    ogDescription: $('meta[property="og:description"]').attr("content"),
    author: $('meta[name="author"]').attr("content"),
    publishedDate: $('meta[property="article:published_time"]').attr("content"),
    jsonLd: $('script[type="application/ld+json"]').first().html(),
  };
};

const extractLargestTextBlock = ($: CheerioAPI): string => {
  let bestNode: any = null;
  let bestLen = 0;
  $("p, article, section, div").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > bestLen) {
      bestLen = text.length;
      bestNode = el;
    }
  });
  if (bestNode) {
    return cleanText($(bestNode).text());
  }
  return "";
};

const extractMainContent = ($: CheerioAPI): string => {
  stripJunk($);
  const main =
    $("article").first().text() ||
    $("main").first().text() ||
    $('[role="main"]').first().text() ||
    $(".content").first().text() ||
    $(".post").first().text();

  const cleaned = cleanText(main);
  if (cleaned.length > 300) return cleaned;

  const largest = extractLargestTextBlock($);
  if (largest.length > 0) return largest;

  return cleanText($("body").text());
};

/**
 * Detect if a page likely needs JavaScript rendering for full content.
 * Must be called BEFORE stripJunk() since it checks for noscript elements.
 */
export const needsJsRendering = (
  $: CheerioAPI,
  textLength: number,
): boolean => {
  const hasReactRoot = $("#root, #__next, #app").length > 0;
  const hasNoscript = $("noscript").text().toLowerCase().includes("javascript");
  const minimalContent = textLength < 500;
  return (hasReactRoot && minimalContent) || hasNoscript;
};

const getScrapeCache = () => {
  type CacheEntry = {
    exp: number;
    val: ScrapeResult;
  };
  const globalWithCache = globalThis as typeof globalThis & {
    __scrapeCache?: Map<string, CacheEntry>;
  };
  if (!globalWithCache.__scrapeCache) {
    globalWithCache.__scrapeCache = new Map<string, CacheEntry>();
  }
  return globalWithCache.__scrapeCache;
};

export async function scrapeWithCheerio(url: string): Promise<ScrapeResult> {
  const SCRAPE_TTL_MS = CACHE_TTL.SCRAPE_MS;
  const SCRAPE_CACHE_MAX_ENTRIES = 100; // Prevent unbounded memory growth
  const cache = getScrapeCache();
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of cache) {
    if (entry.exp <= now) cache.delete(key);
  }

  const cached = cache.get(url);
  if (cached && cached.exp > now) {
    cache.delete(url);
    cache.set(url, cached);
    return cached.val;
  }

  console.info("🌐 Scraping URL initiated:", {
    url,
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
    const response = await fetch(url, {
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
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorDetails = {
        url,
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
        url,
        contentType: contentType,
        timestamp: new Date().toISOString(),
      };
      console.error("❌ Non-HTML content type:", errorDetails);
      throw new Error(`Not an HTML page. Content-Type: ${contentType}`);
    }

    const html = await response.text();
    console.info("✅ HTML content fetched:", {
      url,
      contentLength: html.length,
      timestamp: new Date().toISOString(),
    });

    const $ = cheerio.load(html);
    const metadata = extractPageMetadata($);
    // Check for JS rendering BEFORE stripJunk removes noscript elements
    const bodyText = cleanText($("body").text());
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
      new URL(url).hostname;

    // Filter out low-quality content
    if (content.length < 100) {
      const errorDetails = {
        url,
        contentLength: content.length,
        timestamp: new Date().toISOString(),
      };
      console.error("❌ Content too short after cleaning:", errorDetails);
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

    let cleanedContent = content;
    let removedJunkCount = 0;
    for (const pattern of junkPatterns) {
      const matches = cleanedContent.match(pattern);
      if (matches) {
        removedJunkCount += matches.length;
      }
      cleanedContent = cleanedContent.replace(pattern, "");
    }

    console.log("🗑️ Junk content removed:", {
      url,
      removedCount: removedJunkCount,
    });

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

    cache.set(url, { exp: Date.now() + SCRAPE_TTL_MS, val: result });
    enforceCapacity();
    console.info("✅ Scraping completed successfully:", {
      url,
      resultLength: cleanedContent.length,
      summaryLength: summary.length,
      needsJsRendering: needsRender,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    console.error("💥 Scraping failed with exception:", {
      url,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      timestamp: new Date().toISOString(),
    });

    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = "unknown";
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    const val: ScrapeResult = {
      title: hostname,
      content: `Unable to fetch content from ${url}: ${errorMessage}`,
      summary: `Content unavailable from ${hostname}`,
      needsJsRendering: false,
    };
    // Short TTL for errors to allow retry while preventing hammering
    const ERROR_CACHE_TTL_MS = 30_000; // 30 seconds
    cache.set(url, { exp: Date.now() + ERROR_CACHE_TTL_MS, val });
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
  }),
  handler: async (_, args): Promise<ScrapeResult> => {
    return await scrapeWithCheerio(args.url);
  },
});
