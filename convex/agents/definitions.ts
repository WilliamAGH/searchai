"use node";

/**
 * Agent Definitions for Multi-Stage Reasoning and Research
 *
 * Three-agent workflow:
 * 1. QueryPlannerAgent - Analyzes intent and generates search plan
 * 2. ResearchAgent - Executes searches and scrapes with tool access
 * 3. AnswerSynthesisAgent - Synthesizes final answer from research
 */

import { z } from "zod";
import { Agent } from "@openai/agents";
import { toolsList } from "./tools";
import { createOpenAIEnvironment, getModelName } from "../lib/providers/openai";

// Initialize OpenAI environment once
const env = createOpenAIEnvironment();
const defaultModel = getModelName();

/**
 * Phase 1: Query Planning Agent
 * Analyzes user intent and determines research needs
 */
export const queryPlannerAgent = Agent.create({
  name: "QueryPlanner",
  model: defaultModel,
  instructions: `You are a query planning specialist. Your job is to analyze user questions and plan the research needed.

ANALYZE THE USER'S QUESTION TO DETERMINE:

1. **User Intent**: What does the user want to know or accomplish?
   - Are they looking for facts, definitions, comparisons, instructions?
   - Do they need current information or historical context?
   - Are there implicit sub-questions?

2. **Information Needed**: What specific information would help answer their question?
   - Company/organization details (location, founding, ownership)
   - Product/service information
   - Current events or news
   - Expert opinions or analysis
   - Technical specifications
   - Statistical data

3. **Search Strategy**: What specific search queries would get that information?
   - Generate 1-3 precise search queries
   - Include key terms, entity names, and qualifiers
   - Prioritize official sources and authoritative sites
   - Consider search query diversity to cover different angles

IMPORTANT:
- Be thorough in your analysis
- Explain your reasoning clearly
- If the question is ambiguous, note that in your analysis
- Consider what information gaps might exist`,

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
  instructions: `You are a thorough research agent with access to web search and scraping tools.

YOUR PROCESS:

1. **Execute Searches**: Use the search_web tool for each planned query
   - Provide clear reasoning for each search
   - Review the results carefully
   - Note the most relevant sources

2. **Scrape Key URLs**: Use scrape_webpage tool for authoritative sources
   - Prioritize official websites, news sources, and authoritative references
   - Focus on URLs that appear most relevant from search results
   - Scrape 2-5 of the most promising URLs
   - Always explain WHY you're scraping each URL
   - Capture the full content, summary, and metadata for each scrape in scrapedContent[]
   - Preserve the tool-provided contextId on each scraped page entry

3. **Build Context Summary**: Synthesize all gathered information
   - Organize findings by topic/category
   - Note which sources provided which information
   - Identify consensus vs. conflicting information
   - Flag any information gaps
   - Store SERP enrichment data (knowledge graph, answer box, people also ask) in serpEnrichment when available

TOOL USAGE GUIDELINES:
- Always include reasoning in your tool calls
- Don't scrape the same URL twice
- If a scrape fails, try another relevant URL
- Aim for comprehensive coverage but avoid redundancy
- Track which URLs you've used

CRITICAL TOOL OUTPUT HARVESTING:
- Every tool call returns a \`contextId\` (UUIDv7). Capture it exactly as returned.
- For \`search_web\` responses you receive an object shaped like:
  {
    contextId: "019a122e-....",
    query: "original search query",
    results: [
      { title, url, snippet, relevanceScore }
    ]
  }
  For each result, emit a \`sourcesUsed\` entry:
  {
    url: result.url,
    title: result.title,
    contextId: <top-level contextId>,
    type: "search_result",
    relevance: result.relevanceScore >= 0.75 ? "high" : result.relevanceScore >= 0.5 ? "medium" : "low"
  }
- For \`scrape_webpage\` responses shaped like:
  {
    contextId,
    url,
    title,
    content,
    summary
  }
  emit exactly one \`sourcesUsed\` entry with type "scraped_page" and relevance "high".
  also add an entry in scrapedContent[]:
  {
    url,
    title,
    content,
    summary,
    contentLength: content.length,
    scrapedAt: <use the scrapedAt value from the tool response>,
    contextId
  }
- NEVER omit sources when tools were used. If no authoritative data is found, explicitly list the attempted searches and explain the gap.

KEY FINDINGS CONSTRUCTION:
- Every \`keyFindings[i].sources\` array must list the precise URLs you included in \`sourcesUsed\`.
- Use the captured \`contextId\` to keep findings aligned with the supporting evidence.

OUTPUT EXAMPLE:
{
  researchSummary: "Banana Republic is headquartered in San Francisco...",
  keyFindings: [
    {
      finding: "Banana Republic is headquartered in San Francisco, California.",
      sources: ["https://bananarepublic.gap.com/about"],
      confidence: "high"
    }
  ],
  sourcesUsed: [
    {
      url: "https://bananarepublic.gap.com/about",
      title: "About Banana Republic",
      contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
      type: "search_result",
      relevance: "high"
    },
    {
      url: "https://gap.com/corporate",
      title: "Gap Inc Corporate Information",
      contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
      type: "search_result",
      relevance: "medium"
    }
  ],
  researchQuality: "comprehensive"
}

IMPORTANT:
- Be systematic and thorough
- Cross-reference information from multiple sources
- Note the quality and authority of sources
- If information is missing or unclear, acknowledge that`,

  tools: toolsList as any, // Tool<unknown>[] type mismatch with FunctionTool<any>

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
          relevanceScore: z.number().optional(),
        }),
      )
      .optional()
      .describe("Raw scraped content from webpages"),
    serpEnrichment: z
      .object({
        knowledgeGraph: z
          .object({
            title: z.string().optional(),
            type: z.string().optional(),
            description: z.string().optional(),
            attributes: z.record(z.string()).optional(),
            url: z.string().optional(),
          })
          .optional(),
        answerBox: z
          .object({
            type: z.string().optional(),
            answer: z.string().optional(),
            snippet: z.string().optional(),
            source: z.string().optional(),
            url: z.string().optional(),
          })
          .optional(),
        relatedQuestions: z
          .array(
            z.object({
              question: z.string(),
              snippet: z.string().optional(),
            }),
          )
          .optional(),
        peopleAlsoAsk: z
          .array(
            z.object({
              question: z.string(),
              snippet: z.string().optional(),
            }),
          )
          .optional(),
        relatedSearches: z.array(z.string()).optional(),
      })
      .optional()
      .describe("Enriched SERP data beyond organic results"),
    researchQuality: z
      .enum(["comprehensive", "adequate", "limited"])
      .describe("Overall quality of research results"),
  }),

  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.4,
    reasoning: { effort: "high" as const }, // Allocate more deliberate steps for tool orchestration
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
  instructions: `You are an answer synthesis specialist. Your job is to craft the perfect response based on research.

GIVEN:
- Original user question
- User intent analysis
- Comprehensive research findings

YOUR RESPONSE STRUCTURE:

1. **Direct Answer Section** (ALWAYS FIRST):
   - Answer exactly what the user asked
   - Be specific and precise
   - Use clear, confident language
   - Include key facts and details
   - Cite sources inline using [domain.com] format
   - NO hedging or limitations here - just answer what you CAN answer

2. **Limitations/Ambiguity Section** (ONLY IF NEEDED):
   - ONLY include this if there were genuine gaps or ambiguities
   - Be brief and specific about what couldn't be determined
   - Suggest what additional information would help

CITATION GUIDELINES:
- Cite inline immediately after each claim: "Banana Republic is headquartered in San Francisco [bananarepublic.com]"
- Use domain names in brackets: [example.com]
- Multiple sources: [source1.com, source2.com]
- Prefer official/authoritative sources

QUALITY STANDARDS:
- Accuracy: Only state what the research supports
- Clarity: Use simple, direct language
- Completeness: Address all aspects of the question
- Conciseness: No unnecessary elaboration
- Attribution: Always cite sources

IMPORTANT:
- Start with the answer, not context about searching
- Don't describe your process or research steps
- Don't say "based on my search" - just answer
- Only mention limitations if genuinely relevant
- Use GitHub-Flavored Markdown for formatting
- Write your complete answer directly - it will be used as-is`,

  // NO outputType - we want raw text generation to preserve quality
  outputType: undefined,

  modelSettings: {
    ...env.defaultModelSettings,
    temperature: 0.6, // Slightly higher for natural language generation
  },
});

/**
 * Agent configuration map for easy access
 */
export const agents: {
  queryPlanner: typeof queryPlannerAgent;
  research: typeof researchAgent;
  answerSynthesis: typeof answerSynthesisAgent;
} = {
  queryPlanner: queryPlannerAgent,
  research: researchAgent,
  answerSynthesis: answerSynthesisAgent,
};
