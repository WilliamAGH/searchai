"use node";

import { z } from "zod"; // v3 - required by @openai/agents peer dependency
import { tool } from "@openai/agents";
import type { FunctionTool } from "@openai/agents";
import { generateMessageId } from "../lib/id_generator";
import { AGENT_LIMITS, CONTENT_LIMITS } from "../lib/constants/cache";
import type { AgentToolRunContext } from "./tools_context";

/**
 * Research Planning Tool
 *
 * Uses LLM to generate targeted search queries when research is needed.
 * Called by the conversational agent when it determines research is required.
 * Uses FunctionTool<any, any, unknown> per [SDK1] policy — required for SDK compatibility.
 *
 * NOTE: Parameters are intentionally flat (not nested) because:
 * 1. LLMs generate tool calls more reliably with flat schemas
 * 2. OpenAI's function calling API prefers flat parameter objects
 * 3. The three parameters form a cohesive "research plan" unit together
 */
// prettier-ignore
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

    console.info("PLAN_RESEARCH TOOL CALLED:", {
      contextId,
      userQuestion: input.userQuestion.substring(0, CONTENT_LIMITS.SHORT_FIELD_LENGTH),
      researchGoal: input.researchGoal.substring(0, CONTENT_LIMITS.SHORT_FIELD_LENGTH),
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
