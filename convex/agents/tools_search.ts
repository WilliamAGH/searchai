"use node";

import { z } from "zod"; // v3 - required by @openai/agents peer dependency
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { api } from "../_generated/api";
import { generateMessageId } from "../lib/id_generator";
import { getErrorMessage } from "../lib/errors";
import { getActionCtx, type AgentToolRunContext } from "./tools_context";

/**
 * Get the current year for temporal context in tool descriptions.
 * This ensures the LLM knows the current date when formulating search queries.
 */
function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Get a formatted current date string for tool descriptions.
 */
function getCurrentDateString(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Web Search Tool
 *
 * Searches the web and returns results with UUIDv7 context tracking.
 * Uses FunctionTool<any, any, unknown> per [SDK1] policy — required for SDK compatibility.
 */
// prettier-ignore
export const searchWebTool: FunctionTool<any, any, unknown> = tool({  
  name: "search_web",
  description: `Search the web for current information. 

IMPORTANT: Today's date is ${getCurrentDateString()} (year ${getCurrentYear()}). 
When searching for "current", "latest", "best", or "recent" information, include ${getCurrentYear()} in your query.
Do NOT use outdated years like 2024 in queries for current information.

Use this when you need to find:
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
    ctx: AgentToolRunContext,
  ) => {
    const actionCtx = getActionCtx(ctx);
    const contextId = generateMessageId();
    const callStart = Date.now();

    console.info("[SEARCH] SEARCH TOOL CALLED:", {
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
      console.info("[OK] SEARCH TOOL SUCCESS:", {
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
        enrichment: results.enrichment,
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
            relevanceScore: r.relevanceScore ?? 0.5,
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
      console.error("[ERROR] SEARCH TOOL ERROR:", {
        contextId,
        error: getErrorMessage(error),
        durationMs,
      });

      return {
        contextId,
        query: input.query,
        reasoning: input.reasoning,
        error: "Search failed",
        errorMessage: getErrorMessage(error, "Unknown search error"),
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
