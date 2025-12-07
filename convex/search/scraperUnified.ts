"use node";

import type { ScrapeResult } from "./scraper";
import { scrapeWithCheerio } from "./scraper";
// NOTE: Playwright removed - not compatible with Convex's deployment environment
// (requires native browser binaries that aren't available in Convex runtime)

/**
 * Unified scraper using Cheerio for HTML parsing.
 * Playwright fallback was removed as it's not compatible with Convex runtime.
 */
export async function scrapeUrlUnified(url: string): Promise<ScrapeResult> {
  return await scrapeWithCheerio(url);
}
