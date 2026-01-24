"use node";

/**
 * Scraper Actions - Node runtime only
 * Handles webpage scraping with Cheerio and Playwright fallback
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { scrapeUrlUnified } from "./scraperUnified";
import { validateScrapeUrl } from "../lib/url";

export const scrapeUrl = action({
  args: {
    url: v.string(),
  },
  handler: async (_ctx, args) => {
    const validation = validateScrapeUrl(args.url);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    return await scrapeUrlUnified(validation.url);
  },
});
