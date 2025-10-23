/**
 * Agent Tools for Search and Research
 * Proper tool definitions with UUIDv7 context tracking
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { generateMessageId } from "../lib/id_generator";

/**
 * Web Search Tool
 * Searches the web and returns results with context tracking
 */
export const searchWebTool: FunctionTool<any, any, unknown> = tool({
  name: "search_web",
  description: `Search the web for current information. Use this when you need to find:
- Recent facts or news
- Company information
- Product details
- Current events
- Location information
Returns search results with titles, URLs, snippets, and relevance scores.

OUTPUT FORMAT EXAMPLE:
{
  "contextId": "019a122e-....",
  "query": "original search query",
  "resultCount": 3,
  "results": [
    { "title": "Example", "url": "https://example.com", "snippet": "...", "relevanceScore": 0.82 }
  ]
}
Always propagate the top-level contextId into every sourcesUsed entry you derive from these results.`,
  parameters: z.object({
    query: z
      .string()
      .describe(
        "The search query. Be specific and include key terms. Example: 'Banana Republic headquarters location'",
      ),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Number of results to return (1-10)"),
    reasoning: z
      .string()
      .describe(
        "Brief explanation of why this search is needed to answer the user's question",
      ),
  }),
  execute: async (
    input: { query: string; maxResults?: number; reasoning: string },
    ctx: any, // @openai/agents expects RunContext<unknown> but Convex runtime provides ActionCtx
  ) => {
    const actionCtx = ctx as ActionCtx;
    const contextId = generateMessageId();
    const callStart = Date.now();

    console.info("🔍 SEARCH TOOL CALLED:", {
      contextId,
      query: input.query,
      maxResults: input.maxResults || 5,
      reasoning: input.reasoning,
      timestamp: new Date().toISOString(),
    });

    try {
      // @ts-ignore - Known Convex limitation with complex type inference (TS2589)
      const results = await actionCtx.runAction(api.search.searchWeb, {
        query: input.query,
        maxResults: input.maxResults || 5,
      });

      const durationMs = Date.now() - callStart;
      console.info("✅ SEARCH TOOL SUCCESS:", {
        contextId,
        resultCount: results.results.length,
        searchMethod: results.searchMethod,
        hasRealResults: results.hasRealResults,
        durationMs,
      });

      const output = {
        contextId,
        query: input.query,
        reasoning: input.reasoning,
        resultCount: results.results.length,
        searchMethod: results.searchMethod,
        hasRealResults: results.hasRealResults,
        results: results.results.map(
          (r: {
            title: string;
            url: string;
            snippet: string;
            relevanceScore?: number;
          }) => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            relevanceScore: r.relevanceScore || 0.5,
          }),
        ),
        timestamp: Date.now(),
        _toolCallMetadata: {
          toolName: "search_web",
          callStart,
          durationMs,
        },
      };

      return output;
    } catch (error) {
      const durationMs = Date.now() - callStart;
      console.error("❌ SEARCH TOOL ERROR:", {
        contextId,
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs,
      });

      return {
        contextId,
        query: input.query,
        reasoning: input.reasoning,
        error: "Search failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown search error",
        results: [],
        resultCount: 0,
        hasRealResults: false,
        timestamp: Date.now(),
        _toolCallMetadata: {
          toolName: "search_web",
          callStart,
          durationMs,
        },
      };
    }
  },
});

/**
 * Web Scraping Tool
 * Fetches and parses webpage content for detailed information
 */
export const scrapeWebpageTool: FunctionTool<any, any, unknown> = tool({
  name: "scrape_webpage",
  description: `Fetch and parse the full content of a specific webpage. Use this when you need:
- Detailed information from a specific URL
- Content verification from official sources
- In-depth article or page content
- Information beyond search result snippets
Returns the page title, full cleaned content, and a summary.

OUTPUT FORMAT EXAMPLE:
{
  "contextId": "019a122e-....",
  "url": "https://example.com/page",
  "title": "Example Page",
  "content": "Full cleaned content...",
  "summary": "Short synopsis..."
}
Emit exactly one sourcesUsed entry with type "scraped_page" and relevance "high", copying the contextId verbatim.`,
  parameters: z.object({
    url: z
      .string()
      .url()
      .describe(
        "The complete URL to scrape. Must be http or https. Example: 'https://www.bananarepublic.com/about'",
      ),
    reasoning: z
      .string()
      .describe(
        "Brief explanation of why you need to scrape this specific URL",
      ),
  }),
  execute: async (
    input: { url: string; reasoning: string },
    ctx: any, // @openai/agents expects RunContext<unknown> but Convex runtime provides ActionCtx
  ) => {
    const actionCtx = ctx as ActionCtx;
    const contextId = generateMessageId();
    const callStart = Date.now();

    console.info("🌐 SCRAPE TOOL CALLED:", {
      contextId,
      url: input.url,
      reasoning: input.reasoning,
      timestamp: new Date().toISOString(),
    });

    try {
      const content = await actionCtx.runAction(api.search.scrapeUrl, {
        url: input.url,
      });

      const durationMs = Date.now() - callStart;
      console.info("✅ SCRAPE TOOL SUCCESS:", {
        contextId,
        url: input.url,
        titleLength: content.title.length,
        contentLength: content.content.length,
        durationMs,
      });

      return {
        contextId,
        url: input.url,
        reasoning: input.reasoning,
        title: content.title,
        content: content.content,
        summary: content.summary || content.content.substring(0, 500) + "...",
        contentLength: content.content.length,
        timestamp: Date.now(),
        _toolCallMetadata: {
          toolName: "scrape_webpage",
          callStart,
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - callStart;
      console.error("❌ SCRAPE TOOL ERROR:", {
        contextId,
        url: input.url,
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs,
      });

      // Extract hostname for fallback
      let hostname = "";
      try {
        hostname = new URL(input.url).hostname;
      } catch {
        hostname = "unknown";
      }

      return {
        contextId,
        url: input.url,
        reasoning: input.reasoning,
        error: "Scrape failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown scrape error",
        title: hostname,
        content: `Unable to fetch content from ${input.url}`,
        summary: `Content unavailable from ${hostname}`,
        timestamp: Date.now(),
        _toolCallMetadata: {
          toolName: "scrape_webpage",
          callStart,
          durationMs,
        },
      };
    }
  },
});

/**
 * All available tools for agents
 */
export const agentTools: {
  searchWeb: typeof searchWebTool;
  scrapeWebpage: typeof scrapeWebpageTool;
} = {
  searchWeb: searchWebTool,
  scrapeWebpage: scrapeWebpageTool,
};

/**
 * Tool list for agent configuration
 */
export const toolsList: Array<FunctionTool<any, any, unknown>> = [
  searchWebTool,
  scrapeWebpageTool,
];
