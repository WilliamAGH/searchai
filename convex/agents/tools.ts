"use node";

/**
 * Agent Tools for Search and Research
 * Proper tool definitions with UUIDv7 context tracking
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import type { FunctionTool, RunContext } from "@openai/agents";
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { generateMessageId } from "../lib/id_generator";
import { AGENT_LIMITS } from "../lib/constants/cache";

/**
 * Web Search Tool
 * Searches the web and returns results with context tracking
 */
type AgentToolRunContext =
  | RunContext<{ actionCtx?: ActionCtx } | undefined>
  | undefined;

const getActionCtx = (ctx?: AgentToolRunContext): ActionCtx => {
  const actionCtx = ctx?.context?.actionCtx;
  if (!actionCtx) {
    throw new Error(
      "Convex ActionCtx missing from tool run context. Ensure run() is called with context: { actionCtx }.",
    );
  }
  return actionCtx;
};

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
    ctx: AgentToolRunContext,
  ) => {
    const actionCtx = getActionCtx(ctx);
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
      .regex(/^https?:\/\/\S+$/i, "Must be an http or https URL")
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
    ctx: AgentToolRunContext,
  ) => {
    const actionCtx = getActionCtx(ctx);
    const contextId = generateMessageId();
    const callStart = Date.now();

    console.info("🌐 SCRAPE TOOL CALLED:", {
      contextId,
      url: input.url,
      reasoning: input.reasoning,
      timestamp: new Date().toISOString(),
    });

    try {
      const content = await actionCtx.runAction(
        api.search.scraperAction.scrapeUrl,
        {
          url: input.url,
        },
      );

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
        scrapedAt: Date.now(),
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

      // Extract hostname for display purposes only (not business logic).
      // "unknown" is a safe fallback for UI display; the actual error is already
      // logged and preserved in errorMessage field.
      let hostname = "unknown";
      try {
        hostname = new URL(input.url).hostname;
      } catch (parseError) {
        console.warn("URL parse failed in scrape error handler", {
          url: input.url,
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        });
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
        scrapedAt: Date.now(),
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
 * Research Planning Tool
 * Uses LLM to generate targeted search queries when research is needed.
 * This is called by the conversational agent when it determines research is required.
 *
 * NOTE: Parameters are intentionally flat (not nested) because:
 * 1. LLMs generate tool calls more reliably with flat schemas
 * 2. OpenAI's function calling API prefers flat parameter objects
 * 3. The three parameters form a cohesive "research plan" unit together
 */
export const planResearchTool: FunctionTool<any, any, unknown> = tool({
  name: "plan_research",
  description: `Plan a research strategy by generating targeted search queries.
Call this tool ONLY when you need to research information you don't know or aren't confident about.

DO NOT call this tool for:
- Questions you can answer from your training knowledge
- Clarifying questions to the user
- Simple factual information you're confident about

DO call this tool for:
- Recent events, news, or current information
- Specific company/product details you're uncertain about
- Statistics, prices, or data that changes over time
- Verifying information you're not fully confident about

The tool returns search queries you should then execute with search_web.`,
  parameters: z.object({
    userQuestion: z.string().describe("The user's original question"),
    researchGoal: z
      .string()
      .describe("What specific information you need to find"),
    searchQueries: z
      .array(
        z.object({
          query: z.string().describe("A specific search query"),
          priority: z
            .number()
            .min(1)
            .max(3)
            .describe("1=critical, 2=important, 3=supplementary"),
        }),
      )
      .min(AGENT_LIMITS.MIN_SEARCH_QUERIES)
      .max(AGENT_LIMITS.MAX_SEARCH_QUERIES)
      .describe(
        `${AGENT_LIMITS.MIN_SEARCH_QUERIES}-${AGENT_LIMITS.MAX_SEARCH_QUERIES} targeted search queries`,
      ),
  }),
  execute: async (
    input: {
      userQuestion: string;
      researchGoal: string;
      searchQueries: Array<{ query: string; priority: number }>;
    },
    _ctx: AgentToolRunContext,
  ) => {
    // This tool is essentially a structured way for the agent to declare its research plan.
    // The queries are passed through and will be executed by subsequent search_web calls.
    const contextId = generateMessageId();

    console.info("📋 PLAN_RESEARCH TOOL CALLED:", {
      contextId,
      userQuestion: input.userQuestion.substring(0, 100),
      researchGoal: input.researchGoal.substring(0, 100),
      queryCount: input.searchQueries.length,
      queries: input.searchQueries.map((q) => q.query),
    });

    return {
      contextId,
      status: "research_planned",
      userQuestion: input.userQuestion,
      researchGoal: input.researchGoal,
      searchQueries: input.searchQueries.sort(
        (a, b) => a.priority - b.priority,
      ),
      instruction:
        "Now execute these searches using search_web tool, then scrape the most relevant URLs with scrape_webpage.",
      timestamp: Date.now(),
    };
  },
});

/**
 * All available tools for agents
 */
export const agentTools: {
  searchWeb: typeof searchWebTool;
  scrapeWebpage: typeof scrapeWebpageTool;
  planResearch: typeof planResearchTool;
} = {
  searchWeb: searchWebTool,
  scrapeWebpage: scrapeWebpageTool,
  planResearch: planResearchTool,
};

/**
 * Tool list for the conversational agent (includes planning)
 */
export const conversationalToolsList: Array<FunctionTool<any, any, unknown>> = [
  planResearchTool,
  searchWebTool,
  scrapeWebpageTool,
];

/**
 * Tool list for research-only agents (no planning needed)
 */
export const toolsList: Array<FunctionTool<any, any, unknown>> = [
  searchWebTool,
  scrapeWebpageTool,
];
