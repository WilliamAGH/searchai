/**
 * Agent Orchestration
 * Coordinates the three-stage research and answer workflow
 *
 * Flow: Query Planning → Research → Answer Synthesis
 */

"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { run } from "@openai/agents";
import { agents } from "./definitions";
import { generateMessageId } from "../lib/id_generator";
import { api, internal } from "../_generated/api";
import { generateChatTitle } from "../chats/utils";

/**
 * Orchestrate the full research and answer workflow
 *
 * Stages:
 * 1. Query Planning: Analyze intent, determine info needs, generate search queries
 * 2. Research: Execute searches, scrape URLs, gather comprehensive context
 * 3. Answer Synthesis: Generate final answer with citations and limitations
 *
 * @param userQuery - The user's question
 * @param conversationContext - Optional previous conversation context
 * @returns Complete research results with answer, sources, and metadata
 */
export const orchestrateResearchWorkflow = action({
  args: {
    userQuery: v.string(),
    conversationContext: v.optional(v.string()),
  },
  returns: v.object({
    // Workflow tracking
    workflowId: v.string(),

    // Tool call audit log
    toolCallLog: v.array(
      v.object({
        toolName: v.string(),
        timestamp: v.number(),
        reasoning: v.string(),
        input: v.any(),
        resultSummary: v.string(),
        durationMs: v.number(),
        success: v.boolean(),
      }),
    ),

    // Stage 1: Query Planning
    planning: v.object({
      userIntent: v.string(),
      informationNeeded: v.array(v.string()),
      searchQueries: v.array(
        v.object({
          query: v.string(),
          reasoning: v.string(),
          priority: v.number(),
        }),
      ),
      needsWebScraping: v.boolean(),
      anticipatedChallenges: v.optional(v.array(v.string())),
      confidenceLevel: v.number(),
    }),

    // Stage 2: Research
    research: v.object({
      researchSummary: v.string(),
      keyFindings: v.array(
        v.object({
          finding: v.string(),
          sources: v.array(v.string()),
          confidence: v.union(
            v.literal("high"),
            v.literal("medium"),
            v.literal("low"),
          ),
        }),
      ),
      sourcesUsed: v.array(
        v.object({
          url: v.string(),
          title: v.string(),
          contextId: v.string(),
          type: v.union(v.literal("search_result"), v.literal("scraped_page")),
          relevance: v.union(
            v.literal("high"),
            v.literal("medium"),
            v.literal("low"),
          ),
        }),
      ),
      informationGaps: v.optional(v.array(v.string())),
      researchQuality: v.union(
        v.literal("comprehensive"),
        v.literal("adequate"),
        v.literal("limited"),
      ),
    }),

    // Stage 3: Answer
    answer: v.object({
      answer: v.string(),
      hasLimitations: v.boolean(),
      limitations: v.optional(v.string()),
      sourcesUsed: v.array(v.string()),
      answerCompleteness: v.union(
        v.literal("complete"),
        v.literal("partial"),
        v.literal("insufficient"),
      ),
      confidence: v.number(),
    }),

    // Metadata
    metadata: v.object({
      totalDuration: v.number(),
      planningDuration: v.number(),
      researchDuration: v.number(),
      synthesisDuration: v.number(),
      timestamp: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const workflowId = generateMessageId();
    const startTime = Date.now();

    console.info("🚀 WORKFLOW STARTED:", {
      workflowId,
      query: args.userQuery,
      hasContext: !!args.conversationContext,
      timestamp: new Date().toISOString(),
    });

    // ============================================
    // STAGE 1: QUERY PLANNING
    // ============================================
    console.info("📋 STAGE 1: Query Planning");
    const planningStart = Date.now();

    const planningInput = args.conversationContext
      ? `User Question: ${args.userQuery}\n\nConversation Context:\n${args.conversationContext}`
      : args.userQuery;

    const planningResult = await run(agents.queryPlanner, planningInput);

    const planningDuration = Date.now() - planningStart;

    if (!planningResult.finalOutput) {
      throw new Error("Planning failed: no final output");
    }

    console.info("✅ PLANNING COMPLETE:", {
      workflowId,
      duration: planningDuration,
      userIntent: planningResult.finalOutput.userIntent,
      queryCount: planningResult.finalOutput.searchQueries.length,
      needsScraping: planningResult.finalOutput.needsWebScraping,
      confidence: planningResult.finalOutput.confidenceLevel,
    });

    // ============================================
    // STAGE 2: RESEARCH
    // ============================================
    console.info("🔬 STAGE 2: Research Execution");
    const researchStart = Date.now();

    // Build research instructions with planning context
    const researchInstructions = `
ORIGINAL QUESTION: ${args.userQuery}

USER INTENT: ${planningResult.finalOutput.userIntent}

INFORMATION NEEDED:
${planningResult.finalOutput.informationNeeded.map((info: string, i: number) => `${i + 1}. ${info}`).join("\n")}

SEARCH PLAN:
${planningResult.finalOutput.searchQueries
  .map(
    (
      q: { query: string; reasoning: string; priority: number },
      i: number,
    ) => `${i + 1}. Query: "${q.query}"
   Reasoning: ${q.reasoning}
   Priority: ${q.priority}`,
  )
  .join("\n\n")}

YOUR TASK:
1. Execute each planned search using the search_web tool
2. Review search results and identify the most authoritative sources
3. Scrape ${planningResult.finalOutput.needsWebScraping ? "2-5" : "1-3"} of the most relevant URLs using scrape_webpage tool
4. Synthesize all findings into a comprehensive research summary

Remember:
- Always provide reasoning when calling tools
- Track all sources and their context IDs
- Cross-reference information from multiple sources
- Note any information gaps or conflicting data
`;

    const researchResult = await run(agents.research, researchInstructions);

    const researchDuration = Date.now() - researchStart;

    if (!researchResult.finalOutput) {
      throw new Error("Research failed: no final output");
    }

    // Extract tool call logs from research results
    // The agent framework doesn't expose internal tool calls directly,
    // so we extract metadata from the sourcesUsed which contain contextIds
    const toolCallLog: Array<{
      toolName: string;
      timestamp: number;
      reasoning: string;
      input: any;
      resultSummary: string;
      durationMs: number;
      success: boolean;
    }> = researchResult.finalOutput.sourcesUsed.map(
      (source: any, idx: number) => ({
        toolName:
          source.type === "scraped_page" ? "scrape_webpage" : "search_web",
        timestamp: Date.now() - researchDuration + idx * 1000, // Approximate timing
        reasoning: `Gathering information for: ${planningResult.finalOutput?.userIntent || "user query"}`,
        input:
          source.type === "scraped_page"
            ? { url: source.url }
            : {
                query:
                  planningResult.finalOutput?.searchQueries?.[
                    idx %
                      (planningResult.finalOutput?.searchQueries?.length || 1)
                  ]?.query,
              },
        resultSummary: `${source.type === "scraped_page" ? "Scraped" : "Searched"}: ${source.title}`,
        durationMs: 1000, // Estimated
        success: true,
      }),
    );

    console.info("✅ RESEARCH COMPLETE:", {
      workflowId,
      duration: researchDuration,
      sourcesUsed: researchResult.finalOutput.sourcesUsed.length,
      findingsCount: researchResult.finalOutput.keyFindings.length,
      researchQuality: researchResult.finalOutput.researchQuality,
      hasGaps: !!researchResult.finalOutput.informationGaps?.length,
      toolCallsLogged: toolCallLog.length,
    });

    // ============================================
    // STAGE 3: ANSWER SYNTHESIS
    // ============================================
    console.info("✍️ STAGE 3: Answer Synthesis");
    const synthesisStart = Date.now();

    // Build synthesis instructions with full context
    const synthesisInstructions = `
ORIGINAL QUESTION: ${args.userQuery}

USER INTENT: ${planningResult.finalOutput.userIntent}

RESEARCH FINDINGS:

${researchResult.finalOutput.researchSummary}

KEY FACTS:
${researchResult.finalOutput.keyFindings
  .map(
    (
      finding: { finding: string; sources: string[]; confidence: string },
      i: number,
    ) => `${i + 1}. ${finding.finding}
   Sources: ${finding.sources.join(", ")}
   Confidence: ${finding.confidence}`,
  )
  .join("\n\n")}

SOURCES AVAILABLE:
${researchResult.finalOutput.sourcesUsed
  .map(
    (
      source: { url: string; title: string; type: string; relevance: string },
      i: number,
    ) => `${i + 1}. [${new URL(source.url).hostname}] ${source.title}
   Type: ${source.type}
   Relevance: ${source.relevance}
   URL: ${source.url}`,
  )
  .join("\n")}

${
  researchResult.finalOutput.informationGaps?.length
    ? `INFORMATION GAPS:\n${researchResult.finalOutput.informationGaps.map((gap: string, i: number) => `${i + 1}. ${gap}`).join("\n")}\n`
    : ""
}

YOUR TASK:
1. Write a direct, clear answer to: "${args.userQuery}"
2. Start immediately with the answer - no preamble
3. Cite sources inline using [domain.com] format
4. Only mention limitations if genuinely relevant
5. Use markdown formatting for readability

Remember the user wants to know: ${planningResult.finalOutput.userIntent}
`;

    const synthesisResult = await run(
      agents.answerSynthesis,
      synthesisInstructions,
    );

    const synthesisDuration = Date.now() - synthesisStart;
    const totalDuration = Date.now() - startTime;

    if (!synthesisResult.finalOutput) {
      throw new Error("Synthesis failed: no final output");
    }

    console.info("✅ SYNTHESIS COMPLETE:", {
      workflowId,
      duration: synthesisDuration,
      answerLength: synthesisResult.finalOutput.answer.length,
      hasLimitations: synthesisResult.finalOutput.hasLimitations,
      completeness: synthesisResult.finalOutput.answerCompleteness,
      confidence: synthesisResult.finalOutput.confidence,
      sourcesUsed: synthesisResult.finalOutput.sourcesUsed.length,
    });

    console.info("🎉 WORKFLOW COMPLETE:", {
      workflowId,
      totalDuration,
      stages: {
        planning: planningDuration,
        research: researchDuration,
        synthesis: synthesisDuration,
      },
      timestamp: new Date().toISOString(),
    });

    // Return complete workflow results
    // Normalize null to undefined for Convex v.optional() compatibility
    const normalizedPlanning = {
      ...planningResult.finalOutput,
      anticipatedChallenges:
        planningResult.finalOutput.anticipatedChallenges ?? undefined,
    };

    const normalizedResearch = {
      ...researchResult.finalOutput,
      informationGaps: researchResult.finalOutput.informationGaps ?? undefined,
    };

    const normalizedAnswer = {
      ...synthesisResult.finalOutput,
      limitations: synthesisResult.finalOutput.limitations ?? undefined,
    };

    return {
      workflowId,
      toolCallLog,
      planning: normalizedPlanning,
      research: normalizedResearch,
      answer: normalizedAnswer,
      metadata: {
        totalDuration,
        planningDuration,
        researchDuration,
        synthesisDuration,
        timestamp: Date.now(),
      },
    };
  },
});

/**
 * Orchestrate research workflow with STREAMING support
 * Emits real-time progress events for UI display
 *
 * Event types emitted:
 * - progress: Stage updates (planning, searching, scraping, analyzing, generating)
 * - reasoning: Thinking process from agents
 * - content: Answer text chunks (token-by-token)
 * - tool_result: Results from tool calls (search, scrape)
 * - complete: Final workflow metadata
 * - error: Error events
 *
 * @param userQuery - The user's question
 * @param conversationContext - Optional conversation history
 * @returns Async generator yielding progress events
 */
export const orchestrateResearchWorkflowStreaming = action({
  args: {
    userQuery: v.string(),
    conversationContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflowId = generateMessageId();
    const startTime = Date.now();

    console.info("🚀 STREAMING WORKFLOW STARTED:", {
      workflowId,
      query: args.userQuery,
      hasContext: !!args.conversationContext,
      timestamp: new Date().toISOString(),
    });

    // Create async generator for streaming events
    async function* streamEvents() {
      try {
        // ============================================
        // STAGE 1: QUERY PLANNING
        // ============================================
        yield {
          type: "progress",
          stage: "planning",
          message: "Analyzing your question and planning research strategy...",
        };

        const planningInput = args.conversationContext
          ? `User Question: ${args.userQuery}\n\nConversation Context:\n${args.conversationContext}`
          : args.userQuery;

        const planningResult = await run(
          agents.queryPlanner,
          planningInput,
          { stream: true }, // Enable streaming!
        );

        let planningOutput: any = null;

        // Stream planning events
        for await (const event of planningResult) {
          if (event.type === "run_item_stream_event") {
            if (event.name === "reasoning_item_created") {
              const item = event.item as any; // RunReasoningItem
              yield {
                type: "reasoning",
                content: item.content || item.text || "",
              };
            }
          }
        }

        planningOutput = planningResult.finalOutput;

        if (!planningOutput) {
          throw new Error("Planning failed: no final output");
        }

        console.info("✅ PLANNING COMPLETE:", {
          workflowId,
          queryCount: planningOutput.searchQueries.length,
        });

        // ============================================
        // STAGE 2: RESEARCH
        // ============================================
        yield {
          type: "progress",
          stage: "searching",
          message: `Executing ${planningOutput.searchQueries.length} search ${planningOutput.searchQueries.length === 1 ? "query" : "queries"}...`,
          queries: planningOutput.searchQueries.map((q: any) => q.query),
        };

        // Build research instructions
        const researchInstructions = `
ORIGINAL QUESTION: ${args.userQuery}

USER INTENT: ${planningOutput.userIntent}

INFORMATION NEEDED:
${planningOutput.informationNeeded.map((info: string, i: number) => `${i + 1}. ${info}`).join("\n")}

SEARCH PLAN:
${planningOutput.searchQueries
  .map(
    (
      q: { query: string; reasoning: string; priority: number },
      i: number,
    ) => `${i + 1}. Query: "${q.query}"
   Reasoning: ${q.reasoning}
   Priority: ${q.priority}`,
  )
  .join("\n\n")}

YOUR TASK:
1. Execute each planned search using the search_web tool
2. Review search results and identify the most authoritative sources
3. Scrape ${planningOutput.needsWebScraping ? "2-5" : "1-3"} of the most relevant URLs using scrape_webpage tool
4. Synthesize all findings into a comprehensive research summary

Remember:
- Always provide reasoning when calling tools
- Track all sources and their context IDs
- Cross-reference information from multiple sources
- Note any information gaps or conflicting data
`;

        const researchResult = await run(
          agents.research,
          researchInstructions,
          { stream: true }, // Enable streaming!
        );

        const urlsBeingScrapped: string[] = [];
        let researchOutput: any = null;

        // Stream research events
        for await (const event of researchResult) {
          if (event.type === "run_item_stream_event") {
            // Tool call events
            if (event.name === "tool_called") {
              const item = event.item as any;
              const toolName = item.toolCall?.name || item.name;

              if (toolName === "search_web") {
                yield {
                  type: "progress",
                  stage: "searching",
                  message: "Searching the web...",
                };
              } else if (toolName === "scrape_webpage") {
                const url =
                  item.toolCall?.arguments?.url || item.arguments?.url;
                if (url) {
                  urlsBeingScrapped.push(url);
                  try {
                    const hostname = new URL(url).hostname;
                    yield {
                      type: "progress",
                      stage: "scraping",
                      message: `Reading content from ${hostname}...`,
                      currentUrl: url,
                      urls: [...urlsBeingScrapped],
                    };
                  } catch {
                    yield {
                      type: "progress",
                      stage: "scraping",
                      message: "Reading web content...",
                      currentUrl: url,
                      urls: [...urlsBeingScrapped],
                    };
                  }
                }
              }
            }

            // Tool output events - capture search results
            if (event.name === "tool_output") {
              const item = event.item as any;
              const toolName = item.toolCall?.name || item.name;

              yield {
                type: "tool_result",
                toolName,
                result: item.output || item.result || "",
              };
            }
          }
        }

        researchOutput = researchResult.finalOutput;

        if (!researchOutput) {
          throw new Error("Research failed: no final output");
        }

        console.info("✅ RESEARCH COMPLETE:", {
          workflowId,
          sourcesUsed: researchOutput.sourcesUsed.length,
        });

        // ============================================
        // STAGE 3: ANSWER SYNTHESIS
        // ============================================
        yield {
          type: "progress",
          stage: "analyzing",
          message: `Analyzing findings from ${researchOutput.sourcesUsed.length} ${researchOutput.sourcesUsed.length === 1 ? "source" : "sources"}...`,
          sourcesUsed: researchOutput.sourcesUsed.length,
        };

        yield {
          type: "progress",
          stage: "generating",
          message: "Writing comprehensive answer...",
        };

        // Build synthesis instructions
        const synthesisInstructions = `
ORIGINAL QUESTION: ${args.userQuery}

USER INTENT: ${planningOutput.userIntent}

RESEARCH FINDINGS:

${researchOutput.researchSummary}

KEY FACTS:
${researchOutput.keyFindings
  .map(
    (
      finding: { finding: string; sources: string[]; confidence: string },
      i: number,
    ) => `${i + 1}. ${finding.finding}
   Sources: ${finding.sources.join(", ")}
   Confidence: ${finding.confidence}`,
  )
  .join("\n\n")}

SOURCES AVAILABLE:
${researchOutput.sourcesUsed
  .map(
    (
      source: { url: string; title: string; type: string; relevance: string },
      i: number,
    ) => {
      try {
        return `${i + 1}. [${new URL(source.url).hostname}] ${source.title}
   Type: ${source.type}
   Relevance: ${source.relevance}
   URL: ${source.url}`;
      } catch {
        return `${i + 1}. ${source.title}
   Type: ${source.type}
   Relevance: ${source.relevance}`;
      }
    },
  )
  .join("\n")}

${
  researchOutput.informationGaps?.length
    ? `INFORMATION GAPS:\n${researchOutput.informationGaps.map((gap: string, i: number) => `${i + 1}. ${gap}`).join("\n")}\n`
    : ""
}

YOUR TASK:
1. Write a direct, clear answer to: "${args.userQuery}"
2. Start immediately with the answer - no preamble
3. Cite sources inline using [domain.com] format
4. Only mention limitations if genuinely relevant
5. Use markdown formatting for readability

Remember the user wants to know: ${planningOutput.userIntent}
`;

        const synthesisResult = await run(
          agents.answerSynthesis,
          synthesisInstructions,
          { stream: true }, // Enable streaming!
        );

        let synthesisOutput: any = null;

        // Stream answer content token-by-token
        for await (const event of synthesisResult) {
          if (event.type === "raw_model_stream_event") {
            const delta = (event.data as any).choices?.[0]?.delta?.content;
            if (delta) {
              yield {
                type: "content",
                delta: delta,
              };
            }
          }
        }

        synthesisOutput = synthesisResult.finalOutput;

        if (!synthesisOutput) {
          throw new Error("Synthesis failed: no final output");
        }

        const totalDuration = Date.now() - startTime;

        console.info("✅ STREAMING WORKFLOW COMPLETE:", {
          workflowId,
          totalDuration,
          answerLength: synthesisOutput.answer.length,
        });

        // Final completion event with metadata
        yield {
          type: "complete",
          workflow: {
            workflowId,
            planning: planningOutput,
            research: researchOutput,
            answer: synthesisOutput,
            metadata: {
              totalDuration,
              timestamp: Date.now(),
            },
          },
        };
      } catch (error) {
        console.error("💥 STREAMING WORKFLOW FAILED:", {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : "No stack trace",
        });

        yield {
          type: "error",
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }

    return streamEvents();
  },
});

/**
 * Run the agent workflow and persist messages to the database
 * - Inserts user message
 * - Updates chat title to reflect most recent user intent
 * - Runs orchestration (planning → research → synthesis)
 * - Inserts assistant message with sources and contextReferences
 */
export const runAgentWorkflowAndPersist = action({
  args: {
    chatId: v.id("chats"),
    message: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    workflowId: v.string(),
    assistantMessageId: v.id("messages"),
    answer: v.string(),
    sources: v.array(v.string()),
    contextReferences: v.array(
      v.object({
        contextId: v.string(),
        type: v.union(v.literal("search_result"), v.literal("scraped_page")),
        url: v.optional(v.string()),
        title: v.optional(v.string()),
        timestamp: v.number(),
        relevanceScore: v.optional(v.number()),
      }),
    ),
  }),
  // @ts-ignore - Known Convex TS2589: deep generic inference in action handlers
  handler: async (ctx, args) => {
    // 1) Insert user message
    // @ts-ignore - Convex TS2589 deep generic inference on runMutation
    await ctx.runMutation(internal.messages.addMessage as any as any, {
      chatId: args.chatId,
      role: "user",
      content: args.message,
    });

    // 2) Fetch chat for later title comparison
    // @ts-ignore - Convex TS2589 deep generic inference on runQuery
    const chat = await ctx.runQuery(api.chats.getChatById as any, {
      chatId: args.chatId,
      sessionId: args.sessionId,
    });

    // 3) Build conversationContext from last messages via query
    // @ts-ignore - Known Convex TS2589 on deep generics during runQuery
    const recent = (await ctx.runQuery(api.chats.getChatMessages as any, {
      chatId: args.chatId,
      sessionId: args.sessionId,
    })) as Array<{ role: "user" | "assistant" | "system"; content?: string }>;
    const conversationContext: string = (recent || [])
      .slice(-20)
      .map(
        (m: { role: "user" | "assistant" | "system"; content?: string }) =>
          `${m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}: ${m.content || ""}`,
      )
      .join("\n")
      .slice(0, 4000);

    // 4) Run orchestration
    const result: {
      workflowId: string;
      planning: {
        userIntent: string;
      };
      research: {
        sourcesUsed: Array<{
          url: string;
          title: string;
          contextId: string;
          type: "search_result" | "scraped_page";
          relevance: "high" | "medium" | "low";
        }>;
      };
      answer: { answer: string; sourcesUsed: string[] };
    } = await ctx.runAction(
      api.agents.orchestration.orchestrateResearchWorkflow,
      {
        userQuery: args.message,
        conversationContext,
      },
    );

    const generatedTitle = generateChatTitle({
      intent: result.planning?.userIntent || args.message,
    });

    if (chat && chat.title !== generatedTitle) {
      // @ts-ignore - Convex TS2589 deep generic inference on runMutation
      await ctx.runMutation(internal.chats.internalUpdateChatTitle as any, {
        chatId: args.chatId,
        title: generatedTitle,
      });
    }

    // 5) Map sources to contextReferences
    const contextReferences = (result.research.sourcesUsed || []).map((src) => {
      const relevanceScore =
        src.relevance === "high" ? 0.9 : src.relevance === "medium" ? 0.7 : 0.5;
      return {
        contextId: src.contextId,
        type: src.type,
        url: src.url,
        title: src.title,
        timestamp: Date.now(),
        relevanceScore,
      };
    });

    const searchResults = contextReferences
      .filter((ref) => typeof ref.url === "string" && ref.url.length > 0)
      .map((ref) => ({
        title: ref.title || ref.url!,
        url: ref.url!,
        snippet: "",
        relevanceScore: ref.relevanceScore ?? 0.5,
      }));

    // 6) Insert assistant message
    // @ts-ignore - Convex TS2589 deep generic inference on runMutation
    const assistantMessageId: any = await ctx.runMutation(
      internal.messages.addMessage as any as any,
      {
        chatId: args.chatId,
        role: "assistant",
        content: result.answer.answer,
        sources: result.answer.sourcesUsed,
        searchResults,
        contextReferences,
        workflowId: result.workflowId,
        isStreaming: false,
      },
    );

    return {
      workflowId: result.workflowId,
      assistantMessageId,
      answer: result.answer.answer,
      sources: result.answer.sourcesUsed || [],
      contextReferences,
    };
  },
}) as any;
