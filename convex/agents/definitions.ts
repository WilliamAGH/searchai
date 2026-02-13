"use node";

/**
 * Agent Definitions for Multi-Stage Reasoning and Research
 *
 * Three-agent workflow:
 * 1. QueryPlannerAgent - Analyzes intent and generates search plan
 * 2. ResearchAgent - Executes searches and scrapes with tool access
 * 3. AnswerSynthesisAgent - Synthesizes final answer from research
 *
 * Prompts are extracted to prompts.ts per clean code guidelines [WRN1].
 */

// NOTE: OpenAI Agents SDK requires Zod v3. Keep v3 confined to this integration
// layer and validate tool outputs against v4 schemas in convex/agents/schema.ts.
import { z } from "zod";
import { Agent } from "@openai/agents";
import { toolsList, conversationalToolsList } from "./tools";
import {
  getOpenAIEnvironment,
  getModelName,
  getVisionModelName,
} from "../lib/providers/openai";
import { AGENT_LIMITS } from "../lib/constants/cache";
import {
  QUERY_PLANNER_PROMPT,
  RESEARCH_AGENT_PROMPT,
  ANSWER_SYNTHESIS_PROMPT,
  CONVERSATIONAL_IMAGE_ANALYSIS_GUIDELINES,
  buildConversationalAgentPrompt,
} from "./prompts";

// Initialize OpenAI environment once
const env = getOpenAIEnvironment();
const defaultModel = getModelName();
const visionModel = getVisionModelName();
const agentTools = toolsList satisfies ReturnType<typeof Agent.create>["tools"];
const conversationalAgentTools = conversationalToolsList satisfies ReturnType<
  typeof Agent.create
>["tools"];
const conversationalPromptLimits = {
  minSearchQueries: AGENT_LIMITS.MIN_SEARCH_QUERIES,
  maxSearchQueries: AGENT_LIMITS.MAX_SEARCH_QUERIES,
  minScrapeUrls: AGENT_LIMITS.MIN_SCRAPE_URLS,
  maxScrapeUrls: AGENT_LIMITS.MAX_SCRAPE_URLS,
} as const;

const conversationalToolEnabledInstructions = buildConversationalAgentPrompt(
  conversationalPromptLimits,
);

/**
 * Phase 1: Query Planning Agent
 * Analyzes user intent and determines research needs
 */
export const queryPlannerAgent = Agent.create({
  name: "QueryPlanner",
  model: defaultModel,
  instructions: QUERY_PLANNER_PROMPT,

  outputType: z.object({
    userIntent: z.string().describe("What the user wants to know or do"),
    informationNeeded: z
      .array(z.string())
      .describe("List of specific information types needed"),
    searchQueries: z
      .array(
        z.object({
          query: z.string().describe("The search query"),
          reasoning: z
            .string()
            .describe("Why this search will help answer the question"),
          priority: z
            .number()
            .min(1)
            .max(3)
            .describe("Priority: 1=critical, 2=important, 3=supplementary"),
        }),
      )
      .describe("Ordered list of search queries with reasoning"),
    needsWebScraping: z
      .boolean()
      .describe(
        "Whether we'll likely need to scrape specific URLs for detailed info",
      ),
    anticipatedChallenges: z
      .array(z.string())
      .nullable()
      .optional()
      .describe("Any potential challenges or ambiguities in answering"),
    confidenceLevel: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Confidence that the planned research will answer the question",
      ),
  }),

  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.3, // Lower temperature for structured planning
  },
});

/**
 * Phase 2: Research Agent
 * Executes searches, scrapes pages, and gathers comprehensive context
 */
export const researchAgent: ReturnType<typeof Agent.create> = Agent.create({
  name: "ResearchAgent",
  model: defaultModel,
  instructions: RESEARCH_AGENT_PROMPT,

  tools: agentTools,

  outputType: z.object({
    researchSummary: z
      .string()
      .describe(
        "Comprehensive summary of all information gathered, organized by topic",
      ),
    keyFindings: z
      .array(
        z.object({
          finding: z.string().describe("The key piece of information"),
          sources: z
            .array(z.string())
            .describe("URLs that support this finding"),
          confidence: z
            .enum(["high", "medium", "low"])
            .describe("Confidence in this finding based on source quality"),
        }),
      )
      .describe("List of key findings with source attribution"),
    sourcesUsed: z
      .array(
        z.object({
          url: z.string(),
          title: z.string(),
          contextId: z.string().describe("UUIDv7 context ID"),
          type: z.enum(["search_result", "scraped_page"]),
          relevance: z
            .enum(["high", "medium", "low"])
            .describe("How relevant this source was"),
        }),
      )
      .describe("All sources accessed during research"),
    informationGaps: z
      .array(z.string())
      .nullable()
      .optional()
      .describe("Any information that couldn't be found"),
    scrapedContent: z
      .array(
        z.object({
          url: z.string(),
          title: z.string(),
          content: z
            .string()
            .describe(
              "Full scraped text content (truncate to budget before returning if needed)",
            ),
          summary: z.string().describe("Summary or first 500 characters"),
          contentLength: z.number().describe("Length of the scraped content"),
          scrapedAt: z.number().describe("Timestamp when the page was scraped"),
          contextId: z.string().describe("UUIDv7 context ID from tool output"),
          relevanceScore: z.number().nullable(),
        }),
      )
      .nullable()
      .describe(
        "Raw scraped content from webpages - MUST be populated when scrape_webpage tool is used",
      ),
    serpEnrichment: z
      .object({
        knowledgeGraph: z
          .object({
            title: z.string().nullable(),
            type: z.string().nullable(),
            description: z.string().nullable(),
            attributes: z.record(z.string()).nullable(),
            url: z.string().nullable(),
          })
          .nullable(),
        answerBox: z
          .object({
            type: z.string().nullable(),
            answer: z.string().nullable(),
            snippet: z.string().nullable(),
            source: z.string().nullable(),
            url: z.string().nullable(),
          })
          .nullable(),
        relatedQuestions: z
          .array(
            z.object({
              question: z.string(),
              snippet: z.string().nullable(),
            }),
          )
          .nullable(),
        peopleAlsoAsk: z
          .array(
            z.object({
              question: z.string(),
              snippet: z.string().nullable(),
            }),
          )
          .nullable(),
        relatedSearches: z.array(z.string()).nullable(),
      })
      .nullable()
      .describe(
        "Enriched SERP data - MUST be populated when search_web returns enrichment data",
      ),
    researchQuality: z
      .enum(["comprehensive", "adequate", "limited"])
      .describe("Overall quality of research results"),
  }),

  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.4,
    // NOTE: Removed reasoning: { effort: "high" } which was causing 60+ second delays
    // Tool orchestration doesn't need extensive reasoning - just execute the plan
  },
});

/**
 * Phase 3: Answer Synthesis Agent
 * Synthesizes final answer from research context
 *
 * NOTE: This agent uses RAW TEXT OUTPUT (no structured output)
 * to preserve answer quality and avoid rewriting artifacts.
 * Metadata is extracted via parsing after generation.
 */
export const answerSynthesisAgent = Agent.create({
  name: "AnswerSynthesisAgent",
  model: defaultModel,
  instructions: ANSWER_SYNTHESIS_PROMPT,

  // NO outputType - we want raw text generation to preserve quality
  outputType: undefined,

  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.6, // Slightly higher for natural language generation
  },
});

/**
 * Conversational Agent (Single-Agent Architecture)
 *
 * This agent handles the entire conversation flow:
 * 1. Responds directly if it knows the answer and is confident
 * 2. Asks clarifying questions if the query is ambiguous
 * 3. Calls plan_research → search_web → scrape_webpage when research is needed
 *
 * This eliminates the 3-agent sequential pipeline, providing:
 * - Instant first response (no planning delay)
 * - Research only when actually needed
 * - Single context throughout the conversation
 */
export const conversationalAgent = Agent.create({
  name: "Assistant",
  model: defaultModel,
  instructions: conversationalToolEnabledInstructions,

  tools: conversationalAgentTools,

  // No structured output - we want natural conversation
  outputType: undefined,

  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.7, // Slightly higher for natural conversation
  },
});

/**
 * Conversational Vision Agent (Image Attachments)
 *
 * Uses a dedicated vision-capable model so image inputs are actually processed.
 * This avoids "confident hallucinations" when the default model is text-only.
 */
export const conversationalVisionAgent = Agent.create({
  name: "AssistantVision",
  model: visionModel,
  instructions:
    conversationalToolEnabledInstructions +
    "\n\n" +
    CONVERSATIONAL_IMAGE_ANALYSIS_GUIDELINES,
  tools: conversationalAgentTools,
  outputType: undefined,
  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.3, // Reduce hallucinations for vision/OCR tasks
  },
});

/**
 * Agent configuration map for easy access
 */
export const agents: {
  queryPlanner: typeof queryPlannerAgent;
  research: typeof researchAgent;
  answerSynthesis: typeof answerSynthesisAgent;
  conversational: typeof conversationalAgent;
  conversationalVision: typeof conversationalVisionAgent;
} = {
  queryPlanner: queryPlannerAgent,
  research: researchAgent,
  answerSynthesis: answerSynthesisAgent,
  conversational: conversationalAgent,
  conversationalVision: conversationalVisionAgent,
};
