"use node";

import { z } from "zod"; // v3 - required by @openai/agents peer dependency
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { api } from "../_generated/api";
import { generateMessageId } from "../lib/id_generator";
import { getErrorMessage } from "../lib/errors";
import { CONTENT_LIMITS } from "../lib/constants/cache";
import { getActionCtx, type AgentToolRunContext } from "./tools_context";

/**
 * Web Scraping Tool
 *
 * Fetches and parses webpage content for detailed information.
 * Uses FunctionTool<any, any, unknown> per [SDK1] policy — required for SDK compatibility.
 */
// oxfmt-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required by OpenAI Agents SDK; see docs/contracts/sdk-integration.md
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

    console.info("SCRAPE TOOL CALLED:", {
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
      console.info("[OK] SCRAPE TOOL SUCCESS:", {
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
        summary: content.summary || content.content.substring(0, CONTENT_LIMITS.SUMMARY_TRUNCATE_LENGTH) + "...",
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
      console.error("[ERROR] SCRAPE TOOL ERROR:", {
        contextId,
        url: input.url,
        error: getErrorMessage(error),
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
          error: getErrorMessage(parseError),
        });
      }

      return {
        contextId,
        url: input.url,
        reasoning: input.reasoning,
        error: "Scrape failed",
        errorMessage: getErrorMessage(error, "Unknown scrape error"),
        title: hostname,
        content: `Unable to fetch content from ${input.url}`,
        summary: `Content unavailable from ${hostname}`,
        contentLength: 0,
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
