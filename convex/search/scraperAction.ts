"use node";

/**
 * Scraper Actions - Node runtime only
 * Handles webpage scraping with Cheerio and Playwright fallback
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { scrapeUrlUnified } from "./scraperUnified";

export const scrapeUrl = action({
  args: {
    url: v.string(),
  },
  handler: async (_ctx, args) => {
    return await scrapeUrlUnified(args.url);
  },
});
