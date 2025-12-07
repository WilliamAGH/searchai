"use node";

/**
 * Multi-Agent Research Orchestration
 *
 * CRITICAL OPENAI AGENTS STREAMING PATTERN:
 * ========================================
 * When using `run(agent, input, { stream: true })`, it returns a `StreamedRunResult`
 * which is an AsyncIterable. After consuming the stream with `for await`, you MUST
 * await `result.completed` before accessing `result.finalOutput`.
 *
 * Example:
 * ```ts
 * const result = await run(agent, input, { stream: true });
 * for await (const event of result) {
 *   // Process streaming events
 * }
 * await result.completed;  // CRITICAL: Wait for stream to fully complete
 * const output = result.finalOutput;  // Now safe to access
 * ```
 *
 * CONVEX TYPE SYSTEM CONSTRAINTS:
 * ==============================
 * Convex cannot serialize:
 * - Empty objects: {} (throws "{} is not a supported Convex type")
 * - undefined values in object fields
 * - Functions or class instances
 * - Circular references
 *
 * All data passed to:
 * - yield statements in generators
 * - return statements in actions
 * - ctx.runMutation() / ctx.runQuery() calls
 *
 * Must be valid Convex types (primitives, arrays, objects with values).
 *
 * BUG HISTORY:
 * ===========
 * The bug "{} is not a supported Convex type" occurred because:
 * 1. StreamedRunResult.finalOutput was accessed before await result.completed
 * 2. This caused finalOutput to be {} (empty object) during stream processing
 * 3. Convex rejected the empty object when trying to serialize it
 *
 * SOLUTION:
 * ========
 * Always await result.completed before accessing finalOutput in streaming mode.
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { RunToolCallItem, RunToolCallOutputItem, run } from "@openai/agents";
import { generateMessageId } from "../lib/id_generator";
import { api, internal } from "../_generated/api";
import { generateChatTitle } from "../chats/utils";
import { parseAnswerText } from "./answerParser";
import {
  vContextReference,
  vScrapedContent,
  vSerpEnrichment,
} from "../lib/validators";
import { CACHE_TTL } from "../lib/constants/cache";
import {
  buildPlanningInput,
  buildResearchInstructions,
  buildSynthesisInstructions,
  formatContextReferencesForPrompt,
  buildConversationContext,
  extractContextReferencesFromMessages,
  buildConversationBlock,
  processToolCalls,
  buildToolCallLog,
  buildUrlContextMap,
  normalizeSourceContextIds,
  isUuidV7,
  summarizeToolResult,
  normalizeUrl,
  extractContextIdFromOutput,
  convertToContextReferences,
} from "./orchestration_helpers";
import type {
  ResearchContextReference,
  StreamingPersistPayload,
} from "./types";
import type { ScrapedContent, SerpEnrichment } from "../lib/types/search";
import { applyEnhancements } from "../enhancements";
export type { ResearchContextReference } from "./types";

// ============================================
// Tool Output Harvesting
// ============================================
// Programmatically capture tool outputs to ensure scraped content
// and SERP enrichment reach synthesis even if the LLM fails to
// populate these fields in its structured output.

interface HarvestedToolData {
  scrapedContent: ScrapedContent[];
  serpEnrichment: SerpEnrichment;
  searchResults: Array<{
    title: string;
    url: string;
    snippet: string;
    relevanceScore: number;
  }>;
}

/**
 * Harvest tool output programmatically
 * This ensures data flows to synthesis regardless of LLM compliance
 */
function harvestToolOutput(
  toolName: string,
  output: unknown,
  harvested: HarvestedToolData,
): void {
  if (!output || typeof output !== "object") return;

  const out = output as Record<string, unknown>;

  if (toolName === "scrape_webpage" && out.content) {
    // Ensure contextId is a valid UUIDv7, generate one if missing or invalid
    const rawContextId = typeof out.contextId === "string" ? out.contextId : "";
    const contextId = isUuidV7(rawContextId)
      ? rawContextId
      : generateMessageId();

    const scraped: ScrapedContent = {
      url: String(out.url || ""),
      title: String(out.title || ""),
      content: String(out.content || ""),
      summary: String(out.summary || ""),
      contentLength:
        typeof out.contentLength === "number"
          ? out.contentLength
          : String(out.content || "").length,
      scrapedAt: typeof out.scrapedAt === "number" ? out.scrapedAt : Date.now(),
      contextId,
      relevanceScore: 0.9, // Scraped content is high relevance
    };
    harvested.scrapedContent.push(scraped);
    console.log("📥 HARVESTED scrape_webpage:", {
      url: scraped.url,
      contentLength: scraped.contentLength,
      contextId: scraped.contextId,
      generatedContextId: !isUuidV7(rawContextId),
    });
  }

  if (toolName === "search_web") {
    // Harvest search results
    if (Array.isArray(out.results)) {
      const results = out.results as Array<any>;
      for (const r of results) {
        if (r.url && r.title) {
          harvested.searchResults.push({
            title: r.title,
            url: r.url,
            snippet: r.snippet || "",
            relevanceScore: r.relevanceScore || 0.5,
          });
        }
      }
      console.log("📥 HARVESTED search_web results:", results.length);
    }

    // Harvest enrichment
    if (out.enrichment) {
      const enrich = out.enrichment as Partial<SerpEnrichment>;
      if (enrich.knowledgeGraph) {
        harvested.serpEnrichment.knowledgeGraph = enrich.knowledgeGraph;
        console.log(
          "📥 HARVESTED knowledgeGraph:",
          enrich.knowledgeGraph.title,
        );
      }
      if (enrich.answerBox) {
        harvested.serpEnrichment.answerBox = enrich.answerBox;
        console.log(
          "📥 HARVESTED answerBox:",
          enrich.answerBox.answer?.slice(0, 50),
        );
      }
      if (enrich.peopleAlsoAsk?.length) {
        harvested.serpEnrichment.peopleAlsoAsk = enrich.peopleAlsoAsk;
        console.log(
          "📥 HARVESTED peopleAlsoAsk:",
          enrich.peopleAlsoAsk.length,
          "questions",
        );
      }
      if (enrich.relatedSearches?.length) {
        harvested.serpEnrichment.relatedSearches = enrich.relatedSearches;
        console.log(
          "📥 HARVESTED relatedSearches:",
          enrich.relatedSearches.length,
          "searches",
        );
      }
    }
  }
}

type CustomEventParams<T> = {
  detail?: T;
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
};

const ensureCustomEventPolyfill = () => {
  const globalAny = globalThis as Record<string, any>;
  if (typeof globalAny.CustomEvent !== "undefined") {
    return;
  }

  try {
    class NodeCustomEvent<T = any> extends Event {
      detail: T;
      constructor(type: string, params?: CustomEventParams<T>) {
        super(type, params);
        this.detail = (params?.detail as T) ?? (undefined as T);
      }
    }
    globalAny.CustomEvent = NodeCustomEvent;
  } catch {
    class NodeCustomEvent<T = any> {
      type: string;
      detail: T;
      constructor(type: string, params?: CustomEventParams<T>) {
        this.type = type;
        this.detail = (params?.detail as T) ?? (undefined as T);
      }
    }
    globalAny.CustomEvent = NodeCustomEvent;
  }
};

ensureCustomEventPolyfill();

// --------------------------------------------
// Non-streaming workflow
// --------------------------------------------
export const orchestrateResearchWorkflow = action({
  args: {
    userQuery: v.string(),
    conversationContext: v.optional(v.string()),
    contextReferences: v.optional(v.array(vContextReference)),
  },
  returns: v.object({
    workflowId: v.string(),
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
      scrapedContent: v.optional(v.array(vScrapedContent)),
      serpEnrichment: v.optional(vSerpEnrichment),
    }),
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
    metadata: v.object({
      totalDuration: v.number(),
      planningDuration: v.number(),
      researchDuration: v.number(),
      synthesisDuration: v.number(),
      timestamp: v.number(),
    }),
  }),
  // @ts-ignore deep generics
  handler: async (ctx, args) => {
    const { agents } = require("./definitions");
    const workflowId = generateMessageId();
    const startTime = Date.now();

    const planningInput = buildPlanningInput(
      args.userQuery,
      args.conversationContext,
    );
    const planningStart = Date.now();
    const planningResult = await run(agents.queryPlanner, planningInput, {
      context: { actionCtx: ctx },
    });
    const planningDuration = Date.now() - planningStart;
    if (!planningResult.finalOutput)
      throw new Error("Planning failed: no final output");

    const plannedQueries = planningResult.finalOutput.searchQueries ?? [];
    const hasPlannedQueries = plannedQueries.length > 0;
    const conversationBlock = buildConversationBlock(args.conversationContext);
    const referenceBlock = formatContextReferencesForPrompt(
      args.contextReferences ?? [],
    );

    // Research
    const researchStart = Date.now();
    let researchDuration = 0;
    let researchOutput: any;
    let toolCallLog: Array<{
      toolName: string;
      timestamp: number;
      reasoning: string;
      input: any;
      resultSummary: string;
      durationMs: number;
      success: boolean;
    }> = [];

    if (!hasPlannedQueries) {
      researchDuration = Date.now() - researchStart;
      researchOutput = {
        researchSummary:
          "No web research required for this query. Generate the answer using existing context.",
        keyFindings: [],
        sourcesUsed: [],
        informationGaps: undefined,
        researchQuality: "adequate",
      };
    } else {
      // Apply enhancement rules to inject authoritative context for research
      const researchEnhancements = applyEnhancements(args.userQuery, {
        enhanceContext: true,
      });

      const researchInstructions = buildResearchInstructions({
        userQuery: args.userQuery,
        userIntent: planningResult.finalOutput.userIntent,
        conversationBlock,
        referenceBlock,
        informationNeeded: planningResult.finalOutput.informationNeeded,
        searchQueries: plannedQueries,
        needsWebScraping: planningResult.finalOutput.needsWebScraping,
        enhancedContext: researchEnhancements.enhancedContext || undefined,
      });

      const researchResult = await run(agents.research, researchInstructions, {
        context: { actionCtx: ctx },
      });
      researchDuration = Date.now() - researchStart;
      if (!researchResult.finalOutput)
        throw new Error("Research failed: no final output");
      researchOutput = researchResult.finalOutput;

      const entries = processToolCalls(
        researchResult.newItems ?? [],
        researchStart,
        RunToolCallItem,
        RunToolCallOutputItem,
      );
      toolCallLog = buildToolCallLog(entries, summarizeToolResult);

      const urlContextMap = buildUrlContextMap(
        entries,
        extractContextIdFromOutput,
        normalizeUrl,
      );
      const { normalized, invalidCount } = normalizeSourceContextIds(
        researchOutput.sourcesUsed,
        urlContextMap,
        isUuidV7,
        normalizeUrl,
        generateMessageId,
      );
      researchOutput.sourcesUsed = normalized;
      if (invalidCount > 0)
        console.warn("⚠️ Context references normalized", {
          workflowId,
          normalizedSources: invalidCount,
        });
    }

    // Synthesis
    const synthesisStart = Date.now();

    // Apply enhancement rules to inject authoritative context (e.g., founder info)
    const synthesisEnhancements = applyEnhancements(args.userQuery, {
      enhanceContext: true,
      enhanceSystemPrompt: true,
    });

    const synthesisInstructions = buildSynthesisInstructions({
      userQuery: args.userQuery,
      userIntent: planningResult.finalOutput.userIntent,
      researchSummary: researchOutput.researchSummary,
      keyFindings: researchOutput.keyFindings,
      sourcesUsed: researchOutput.sourcesUsed || [],
      informationGaps: researchOutput.informationGaps,
      scrapedContent: researchOutput.scrapedContent,
      serpEnrichment: researchOutput.serpEnrichment,
      enhancedContext: synthesisEnhancements.enhancedContext || undefined,
      enhancedSystemPrompt:
        synthesisEnhancements.enhancedSystemPrompt || undefined,
    });

    const synthesisResult = await run(
      agents.answerSynthesis,
      synthesisInstructions,
      {
        context: { actionCtx: ctx },
      },
    );
    const synthesisDuration = Date.now() - synthesisStart;
    const totalDuration = Date.now() - startTime;
    const rawAnswerText = synthesisResult.finalOutput as string;
    if (!rawAnswerText || typeof rawAnswerText !== "string")
      throw new Error("Synthesis failed: no text output");
    const parsedAnswer = parseAnswerText(rawAnswerText);

    const normalizedPlanning = {
      ...planningResult.finalOutput,
      anticipatedChallenges:
        planningResult.finalOutput.anticipatedChallenges ?? undefined,
    };
    const normalizedResearch = {
      ...researchOutput,
      informationGaps: researchOutput.informationGaps ?? undefined,
    };
    const normalizedAnswer = {
      ...parsedAnswer,
      limitations: parsedAnswer.limitations ?? undefined,
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

// --------------------------------------------
// Streaming workflow (shared helper for HTTP route)
// --------------------------------------------
export type StreamingWorkflowArgs = {
  chatId: Id<"chats">;
  sessionId?: string;
  userQuery: string;
  conversationContext?: string;
  contextReferences?: ResearchContextReference[];
};

type StreamingWorkflowCtx = Pick<
  ActionCtx,
  "runMutation" | "runQuery" | "runAction"
>;

type WorkflowStreamEvent = Record<string, unknown>;

export async function* streamResearchWorkflow(
  ctx: StreamingWorkflowCtx,
  args: StreamingWorkflowArgs,
): AsyncGenerator<WorkflowStreamEvent> {
  const { agents } = require("./definitions");

  const workflowId = generateMessageId();
  const startTime = Date.now();

  const nonce = generateMessageId();
  const issuedAt = Date.now();

  const writeEvent = (
    type: string,
    data: Record<string, unknown>,
  ): WorkflowStreamEvent => {
    const cleaned: Record<string, unknown> = { type };
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      if (
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).length === 0
      )
        continue;
      cleaned[k] = v;
    }
    return cleaned;
  };

  let workflowTokenId: Id<"workflowTokens"> | null = null;

  const handleError = async (error: Error, stage: string) => {
    console.error(`💥 WORKFLOW ERROR [${stage}]`, {
      workflowId,
      error: error.message,
    });
    if (workflowTokenId) {
      try {
        await ctx.runMutation(internal.workflowTokens.invalidateToken, {
          tokenId: workflowTokenId,
        });
      } catch (invalidationError) {
        console.error("Failed to invalidate workflow token", {
          tokenId: workflowTokenId,
          error:
            invalidationError instanceof Error
              ? invalidationError.message
              : "Unknown invalidation error",
        });
      }
    }
    throw error;
  };

  const workflowTokenPayload: {
    workflowId: string;
    nonce: string;
    chatId: Id<"chats">;
    sessionId?: string;
    issuedAt: number;
    expiresAt: number;
  } = {
    workflowId,
    nonce,
    chatId: args.chatId,
    issuedAt,
    expiresAt: issuedAt + CACHE_TTL.WORKFLOW_TOKEN_MS,
  };

  if (args.sessionId) {
    workflowTokenPayload.sessionId = args.sessionId;
  }

  workflowTokenId = await ctx.runMutation(
    // @ts-expect-error - Convex TS2589: deeply nested type inference
    internal.workflowTokens.createToken,
    workflowTokenPayload,
  );

  const getChatArgs: { chatId: Id<"chats">; sessionId?: string } = {
    chatId: args.chatId,
  };
  if (args.sessionId) getChatArgs.sessionId = args.sessionId;

  const chat = await ctx.runQuery(api.chats.getChatById, getChatArgs);
  if (!chat) throw new Error("Chat not found or access denied");

  await ctx.runMutation(internal.messages.addMessage, {
    chatId: args.chatId,
    role: "user",
    content: args.userQuery,
    sessionId: args.sessionId, // Pass sessionId for HTTP action auth
  });

  const getMessagesArgs: { chatId: Id<"chats">; sessionId?: string } = {
    chatId: args.chatId,
  };
  if (args.sessionId) getMessagesArgs.sessionId = args.sessionId;

  const recentMessages = (await ctx.runQuery(
    api.chats.getChatMessages,
    getMessagesArgs,
  )) as Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    contextReferences?: ResearchContextReference[];
  }>;

  const conversationContextFromDb = buildConversationContext(
    recentMessages || [],
  );
  const priorContextReferences = extractContextReferencesFromMessages(
    recentMessages || [],
  );
  const historyReferences = priorContextReferences.slice(-8);
  const streamingContextReferences = [
    ...historyReferences,
    ...(args.contextReferences ?? []),
  ].slice(-12);

  const conversationSource =
    conversationContextFromDb || args.conversationContext || "";
  const conversationBlock = buildConversationBlock(conversationSource);
  const referenceBlock = formatContextReferencesForPrompt(
    streamingContextReferences,
  );

  try {
    yield writeEvent("progress", {
      stage: "planning",
      message: "Analyzing your question and planning research strategy...",
    });

    const planningInput = buildPlanningInput(
      args.userQuery,
      conversationSource,
    );
    const planningResult = await run(agents.queryPlanner, planningInput, {
      stream: true,
      context: { actionCtx: ctx },
    });

    let planningOutput: any = null;
    for await (const event of planningResult) {
      if (
        event.type === "run_item_stream_event" &&
        event.name === "reasoning_item_created"
      ) {
        const item = event.item as any;
        yield writeEvent("reasoning", {
          content: item.content || item.text || "",
        });
      }
    }

    // CRITICAL: Await stream completion before accessing finalOutput
    // StreamedRunResult.finalOutput is only available after the stream fully completes
    console.log(
      "🔍 DEBUG: Planning stream consumed, calling await planningResult.completed...",
    );
    console.log(
      "🔍 DEBUG: planningResult.finalOutput BEFORE await:",
      planningResult.finalOutput,
    );
    await planningResult.completed;
    console.log(
      "🔍 DEBUG: planningResult.finalOutput AFTER await:",
      planningResult.finalOutput,
    );
    console.log(
      "🔍 DEBUG: planningResult.finalOutput type:",
      typeof planningResult.finalOutput,
    );
    console.log(
      "🔍 DEBUG: planningResult.finalOutput keys:",
      planningResult.finalOutput
        ? Object.keys(planningResult.finalOutput)
        : "null/undefined",
    );

    planningOutput = planningResult.finalOutput;

    // Debug: Log the actual planning output structure
    console.log(
      "🔍 DEBUG: Full planningOutput object:",
      JSON.stringify(planningOutput, null, 2),
    );

    // Check for errors in the stream
    if (planningResult.error) {
      console.error("❌ Planning agent error:", planningResult.error);
      throw new Error(`Planning agent failed: ${planningResult.error}`);
    }

    if (!planningOutput || typeof planningOutput !== "object") {
      console.error("❌ Planning failed: output is null or not an object", {
        planningOutput,
        hasError: !!planningResult.error,
        lastAgent: planningResult.lastAgent?.name,
        itemsGenerated: planningResult.newItems?.length || 0,
      });
      throw new Error(
        "Planning failed: agent returned null or invalid output type.",
      );
    }

    const planningKeys = Object.keys(planningOutput);
    if (planningKeys.length === 0) {
      console.error("❌ Planning failed: output is empty object {}", {
        planningOutput,
        error: planningResult.error,
        lastAgent: planningResult.lastAgent?.name,
        newItemsCount: planningResult.newItems?.length || 0,
        outputItems: planningResult.output?.length || 0,
      });

      // Log recent items to debug
      if (planningResult.newItems && planningResult.newItems.length > 0) {
        console.log(
          "Recent items from planning:",
          planningResult.newItems.slice(-3),
        );
      }

      throw new Error(
        "Planning failed: agent returned empty object {}. Check OpenAI API key and model availability.",
      );
    }

    // Ensure searchQueries exists and is an array before proceeding
    if (!Array.isArray(planningOutput.searchQueries)) {
      console.error(
        "⚠️ Planning output missing searchQueries array:",
        planningOutput,
      );
      planningOutput.searchQueries = [];
    }

    const searchQueriesCount = planningOutput.searchQueries.length;
    if (searchQueriesCount > 0) {
      yield writeEvent("progress", {
        stage: "searching",
        message: `Executing ${searchQueriesCount} search ${searchQueriesCount === 1 ? "query" : "queries"}...`,
        queries: planningOutput.searchQueries.map((q: any) => q.query),
      });
    } else {
      yield writeEvent("progress", {
        stage: "analyzing",
        message: "Analyzing your question without web search...",
      });
    }

    // Apply enhancement rules to inject authoritative context for research
    const researchEnhancements = applyEnhancements(args.userQuery, {
      enhanceContext: true,
    });

    const researchInstructions = buildResearchInstructions({
      userQuery: args.userQuery,
      userIntent: planningOutput.userIntent,
      conversationBlock,
      referenceBlock,
      informationNeeded: planningOutput.informationNeeded,
      searchQueries: planningOutput.searchQueries,
      needsWebScraping: planningOutput.needsWebScraping,
      enhancedContext: researchEnhancements.enhancedContext || undefined,
    });

    const researchResult = await run(agents.research, researchInstructions, {
      stream: true,
      context: { actionCtx: ctx },
    });

    const urlsBeingScrapped: string[] = [];

    // Initialize harvested data container for programmatic tool output capture
    const harvested: HarvestedToolData = {
      scrapedContent: [],
      serpEnrichment: {},
      searchResults: [],
    };

    for await (const event of researchResult) {
      if (event.type === "run_item_stream_event") {
        if (event.name === "tool_called") {
          const item = event.item as any;
          const toolName = item.toolCall?.name || item.name;

          if (toolName === "search_web") {
            yield writeEvent("progress", {
              stage: "searching",
              message: "Searching the web...",
            });
          } else if (toolName === "scrape_webpage") {
            const url = item.toolCall?.arguments?.url || item.arguments?.url;
            if (url) {
              urlsBeingScrapped.push(url);
              try {
                const hostname = new URL(url).hostname;
                yield writeEvent("progress", {
                  stage: "scraping",
                  message: `Reading content from ${hostname}...`,
                  currentUrl: url,
                  urls: [...urlsBeingScrapped],
                });
              } catch {
                yield writeEvent("progress", {
                  stage: "scraping",
                  message: "Reading web content...",
                  currentUrl: url,
                  urls: [...urlsBeingScrapped],
                });
              }
            }
          }
        }

        if (event.name === "tool_output") {
          const item = event.item as any;
          const toolName = item.toolCall?.name || item.name;
          const rawResult = item.output || item.result;
          if (
            !rawResult ||
            (typeof rawResult === "object" &&
              !Array.isArray(rawResult) &&
              Object.keys(rawResult).length === 0)
          ) {
            continue;
          }

          // Programmatically harvest tool outputs to ensure data flows to synthesis
          harvestToolOutput(toolName, rawResult, harvested);

          yield writeEvent("tool_result", { toolName, result: rawResult });
        }
      }
    }

    // CRITICAL: Await stream completion before accessing finalOutput
    console.log(
      "🔍 DEBUG: Research stream consumed, calling await researchResult.completed...",
    );
    console.log(
      "🔍 DEBUG: researchResult.finalOutput BEFORE await:",
      researchResult.finalOutput,
    );
    await researchResult.completed;
    console.log(
      "🔍 DEBUG: researchResult.finalOutput AFTER await:",
      researchResult.finalOutput,
    );
    console.log(
      "🔍 DEBUG: researchResult.finalOutput type:",
      typeof researchResult.finalOutput,
    );
    console.log(
      "🔍 DEBUG: researchResult.finalOutput keys:",
      researchResult.finalOutput
        ? Object.keys(researchResult.finalOutput)
        : "null/undefined",
    );

    const researchOutput = researchResult.finalOutput;

    // Debug: Log the actual research output structure
    console.log(
      "🔍 DEBUG: Full researchOutput object:",
      JSON.stringify(researchOutput, null, 2),
    );

    if (!researchOutput || typeof researchOutput !== "object") {
      console.error("❌ Research failed: output is null or not an object", {
        researchOutput,
      });
      throw new Error(
        "Research failed: agent returned null or invalid output type.",
      );
    }

    const researchKeys = Object.keys(researchOutput);
    if (researchKeys.length === 0) {
      console.error("❌ Research failed: output is empty object {}", {
        researchOutput,
        researchResult,
      });
      throw new Error("Research failed: agent returned empty object {}.");
    }

    // ------------------------------------------------------------
    // CRITICAL HALLUCINATION CHECK & FALLBACK
    // ------------------------------------------------------------
    // If the agent didn't actually run tools (harvested data is empty),
    // we MUST NOT trust its output, as it's likely hallucinated.
    // We trigger an emergency search and scrape flow.
    // ------------------------------------------------------------

    const hasRealToolExecution =
      harvested.scrapedContent.length > 0 || harvested.searchResults.length > 0;

    if (!hasRealToolExecution) {
      console.warn(
        "⚠️ DETECTED HALLUCINATION RISK: Agent produced output but executed NO tools.",
      );
      console.warn("⚠️ Discarding potentially hallucinated research output.");

      // Clear potentially hallucinated content
      researchOutput.scrapedContent = [];
      researchOutput.sourcesUsed = [];
      researchOutput.keyFindings = [];
      researchOutput.researchSummary =
        "Research agent failed to execute tools. Performing emergency fallback search.";

      // EMERGENCY SEARCH
      if (
        planningOutput.searchQueries &&
        planningOutput.searchQueries.length > 0
      ) {
        const fallbackQuery = planningOutput.searchQueries[0].query;
        console.log(`🚑 EMERGENCY SEARCH: Running query "${fallbackQuery}"...`);
        yield writeEvent("progress", {
          stage: "searching",
          message: "Agent failed to search. Retrying search...",
        });

        try {
          // @ts-ignore - ActionCtx type mismatch in some convex versions
          const searchResult = await ctx.runAction(api.search.searchWeb, {
            query: fallbackQuery,
            maxResults: 4,
          });

          if (searchResult && searchResult.results) {
            console.log(
              `✅ EMERGENCY SEARCH SUCCESS: Found ${searchResult.results.length} results`,
            );

            // Add to harvested results
            for (const r of searchResult.results) {
              harvested.searchResults.push({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
                relevanceScore: r.relevanceScore || 0.5,
              });
            }

            // Add enrichment if present
            if (searchResult.enrichment) {
              const enrich = searchResult.enrichment;
              if (enrich.knowledgeGraph)
                harvested.serpEnrichment.knowledgeGraph = enrich.knowledgeGraph;
              if (enrich.answerBox)
                harvested.serpEnrichment.answerBox = enrich.answerBox;
              if (enrich.peopleAlsoAsk)
                harvested.serpEnrichment.peopleAlsoAsk = enrich.peopleAlsoAsk;
              if (enrich.relatedSearches)
                harvested.serpEnrichment.relatedSearches =
                  enrich.relatedSearches;
            }
          }
        } catch (err) {
          console.error("❌ EMERGENCY SEARCH FAILED:", err);
        }
      }
    }

    // FALLBACK: Programmatic scraping if we have no scraped content
    // (either because agent didn't scrape, or we just did an emergency search)
    const noScrapedContent = harvested.scrapedContent.length === 0;
    const hasAvailableUrls = harvested.searchResults.length > 0;

    console.log("🔍 FALLBACK CHECK:", {
      harvestedScrapedCount: harvested.scrapedContent.length,
      noScrapedContent,
      harvestedSearchResultsCount: harvested.searchResults.length,
      hasAvailableUrls,
      willTriggerFallback: noScrapedContent && hasAvailableUrls,
    });

    if (noScrapedContent && hasAvailableUrls) {
      console.log(
        "⚠️ FALLBACK SCRAPING: Programmatically scraping top available URLs...",
      );

      // Get unique URLs from harvested search results
      const urlsToScrape = harvested.searchResults
        .filter((r) => r.url && r.url.startsWith("http"))
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 3) // Scrape top 3 URLs
        .map((r) => r.url);

      console.log("🔍 urlsToScrape:", urlsToScrape);

      if (urlsToScrape.length === 0) {
        console.log("⚠️ No valid URLs to scrape after filtering");
      }

      yield writeEvent("progress", {
        stage: "scraping",
        message: `Reading content from ${urlsToScrape.length} sources (fallback)...`,
        urls: urlsToScrape,
      });

      // Scrape URLs in parallel
      const scrapePromises = urlsToScrape.map(async (url: string) => {
        try {
          const contextId = generateMessageId();
          console.log(`🌐 FALLBACK SCRAPE: ${url}`);

          const content = await ctx.runAction(
            api.search.scraperAction.scrapeUrl,
            { url },
          );

          const scraped: ScrapedContent = {
            url,
            title: content.title,
            content: content.content,
            summary: content.summary || content.content.substring(0, 500),
            contentLength: content.content.length,
            scrapedAt: Date.now(),
            contextId,
            relevanceScore: 0.85,
          };

          console.log(`✅ FALLBACK SCRAPE SUCCESS: ${url}`, {
            contentLength: scraped.contentLength,
          });

          return scraped;
        } catch (error) {
          console.error(`❌ FALLBACK SCRAPE FAILED: ${url}`, error);
          return null;
        }
      });

      const scrapeResults = await Promise.all(scrapePromises);
      const successfulScrapes = scrapeResults.filter(
        (r): r is ScrapedContent => r !== null,
      );

      // Add to harvested content
      harvested.scrapedContent.push(...successfulScrapes);

      console.log(
        `📊 FALLBACK SCRAPING COMPLETE: ${successfulScrapes.length}/${urlsToScrape.length} pages scraped`,
      );
    }

    // RECONSTRUCT researchOutput if we had to fallback
    // We need to ensure the synthesis step sees the harvested data
    if (harvested.scrapedContent.length > 0) {
      // Ensure scrapedContent is populated from harvested data
      // This overwrites any hallucinated content or fills empty content
      researchOutput.scrapedContent = harvested.scrapedContent;

      // Map scraped content by URL for quick lookup to ensure contextId consistency
      const scrapedUrlMap = new Map(
        harvested.scrapedContent.map((s) => [s.url, s]),
      );

      // Rebuild sourcesUsed from harvested data to ensure consistency
      const newSources = [
        ...harvested.searchResults.map((r) => {
          const existing = scrapedUrlMap.get(r.url);
          return {
            url: r.url,
            title: r.title,
            contextId: existing ? existing.contextId : generateMessageId(),
            type: "search_result" as const,
            relevance:
              r.relevanceScore > 0.7 ? ("high" as const) : ("medium" as const),
          };
        }),
        ...harvested.scrapedContent.map((s) => ({
          url: s.url,
          title: s.title,
          contextId: s.contextId,
          type: "scraped_page" as const,
          relevance: "high" as const,
        })),
      ];

      // Dedup sources by URL
      const uniqueSources = Array.from(
        new Map(newSources.map((s) => [s.url, s])).values(),
      );
      researchOutput.sourcesUsed = uniqueSources;

      // Also assign serpEnrichment if harvested (consistency with scrapedContent/sourcesUsed)
      if (Object.keys(harvested.serpEnrichment).length > 0) {
        researchOutput.serpEnrichment = harvested.serpEnrichment;
      }

      console.log("🔄 RECONSTRUCTED researchOutput with real harvested data");
    }

    yield writeEvent("progress", {
      stage: "analyzing",
      message: `Analyzing findings from ${researchOutput.sourcesUsed?.length || 0} sources...`,
      sourcesUsed: researchOutput.sourcesUsed?.length || 0,
    });
    yield writeEvent("progress", {
      stage: "generating",
      message: "Writing comprehensive answer...",
    });

    // Merge harvested tool outputs with agent output
    // Agent output takes precedence if populated, otherwise use harvested data
    const mergedScrapedContent =
      researchOutput.scrapedContent && researchOutput.scrapedContent.length > 0
        ? researchOutput.scrapedContent
        : harvested.scrapedContent;

    const hasAgentEnrichment =
      researchOutput.serpEnrichment &&
      Object.keys(researchOutput.serpEnrichment).length > 0;
    const hasHarvestedEnrichment =
      Object.keys(harvested.serpEnrichment).length > 0;
    const mergedSerpEnrichment = hasAgentEnrichment
      ? researchOutput.serpEnrichment
      : hasHarvestedEnrichment
        ? harvested.serpEnrichment
        : undefined;

    // Log context pipeline status for debugging
    console.log("📊 CONTEXT PIPELINE STATUS:", {
      agentScrapedCount: researchOutput.scrapedContent?.length || 0,
      harvestedScrapedCount: harvested.scrapedContent.length,
      mergedScrapedCount: mergedScrapedContent.length,
      agentEnrichmentKeys: Object.keys(researchOutput.serpEnrichment || {}),
      harvestedEnrichmentKeys: Object.keys(harvested.serpEnrichment),
      usingHarvestedScraped:
        mergedScrapedContent === harvested.scrapedContent &&
        harvested.scrapedContent.length > 0,
      usingHarvestedEnrichment:
        mergedSerpEnrichment === harvested.serpEnrichment &&
        hasHarvestedEnrichment,
      hasKnowledgeGraph: !!mergedSerpEnrichment?.knowledgeGraph,
      hasAnswerBox: !!mergedSerpEnrichment?.answerBox,
    });

    // Apply enhancement rules to inject authoritative context (e.g., founder info)
    const synthesisEnhancements = applyEnhancements(args.userQuery, {
      enhanceContext: true,
      enhanceSystemPrompt: true,
    });

    const synthesisInstructions = buildSynthesisInstructions({
      userQuery: args.userQuery,
      userIntent: planningOutput.userIntent,
      researchSummary: researchOutput.researchSummary,
      keyFindings: researchOutput.keyFindings,
      sourcesUsed: researchOutput.sourcesUsed || [],
      informationGaps: researchOutput.informationGaps,
      scrapedContent: mergedScrapedContent,
      serpEnrichment: mergedSerpEnrichment,
      enhancedContext: synthesisEnhancements.enhancedContext || undefined,
      enhancedSystemPrompt:
        synthesisEnhancements.enhancedSystemPrompt || undefined,
    });

    const synthesisResult = await run(
      agents.answerSynthesis,
      synthesisInstructions,
      { stream: true, context: { actionCtx: ctx } },
    );
    let accumulatedAnswer = "";
    for await (const event of synthesisResult) {
      // TypeScript tells us event.type can only be:
      // - "run_item_stream_event"
      // - "agent_updated_stream_event"

      if (event.type === "run_item_stream_event") {
        const item = event.item as any;
        const eventName = (event as any).name;

        // Only capture DELTA events, not full content events
        // 'message_output_created' contains the full message - skip it
        // We want 'text_content_delta' or similar incremental events
        if (eventName === "message_output_created") {
          console.log("🔍 Skipping message_output_created (full content)");
          continue; // Skip full message events
        }

        // Debug: Log event details to find delta events
        console.log("🔍 SYNTHESIS RUN_ITEM EVENT:", eventName);
        console.log("🔍 Item keys:", item ? Object.keys(item) : "no item");
        console.log("🔍 Item type:", item?.type);

        // Look for actual streaming deltas
        // Common delta event patterns:
        // - item.delta.content (incremental text)
        // - item.content_delta (alternative structure)
        const delta =
          item?.delta?.content || // OpenAI Agents SDK delta structure
          item?.content_delta || // Alternative delta field
          item?.text_delta || // Text delta field
          (eventName?.includes("delta") && item?.content); // Any delta event with content

        if (delta && typeof delta === "string" && delta.length > 0) {
          console.log(
            "🔍 CAPTURED DELTA:",
            delta.substring(0, 50) + (delta.length > 50 ? "..." : ""),
          );
          accumulatedAnswer += delta;
          yield writeEvent("content", { delta });
        }
      }
    }

    // CRITICAL: Await stream completion before accessing finalOutput
    console.log(
      "🔍 DEBUG: Synthesis stream consumed, calling await synthesisResult.completed...",
    );
    console.log(
      "🔍 DEBUG: synthesisResult.finalOutput BEFORE await:",
      synthesisResult.finalOutput,
    );
    await synthesisResult.completed;
    console.log(
      "🔍 DEBUG: synthesisResult.finalOutput AFTER await:",
      synthesisResult.finalOutput,
    );
    console.log(
      "🔍 DEBUG: synthesisResult.finalOutput type:",
      typeof synthesisResult.finalOutput,
    );

    const synthesisOutput = synthesisResult.finalOutput as string;
    if (!synthesisOutput || synthesisOutput.trim().length === 0) {
      throw new Error("Synthesis failed: agent returned empty or null output.");
    }

    console.log("🔍 DEBUG: About to parse answer text...");
    console.log(
      "🔍 DEBUG: accumulatedAnswer length:",
      accumulatedAnswer.length,
    );
    console.log("🔍 DEBUG: synthesisOutput length:", synthesisOutput.length);

    const parsedAnswer = parseAnswerText(synthesisOutput);
    console.log(
      "🔍 DEBUG: Parsed answer:",
      JSON.stringify(parsedAnswer, null, 2),
    );

    const finalAnswerText = parsedAnswer.answer || accumulatedAnswer;
    console.log("🔍 DEBUG: Final answer text length:", finalAnswerText.length);

    // CRITICAL FIX: If no content was streamed, send the final answer now
    if (accumulatedAnswer.length === 0 && finalAnswerText.length > 0) {
      console.log(
        "⚠️ No streaming deltas were captured! Sending final answer as single content event...",
      );
      yield writeEvent("content", { delta: finalAnswerText });
    }

    // Validate outputs before yielding to Convex
    // Convex rejects empty objects {} as "not a supported Convex type"
    console.log("🔍 DEBUG: Validating outputs before yielding...");

    if (
      !planningOutput ||
      typeof planningOutput !== "object" ||
      Object.keys(planningOutput).length === 0
    ) {
      throw new Error("Planning output is empty or invalid");
    }
    if (
      !researchOutput ||
      typeof researchOutput !== "object" ||
      Object.keys(researchOutput).length === 0
    ) {
      throw new Error("Research output is empty or invalid");
    }
    if (
      !parsedAnswer ||
      typeof parsedAnswer !== "object" ||
      Object.keys(parsedAnswer).length === 0
    ) {
      throw new Error("Parsed answer is empty or invalid");
    }

    console.log("🔍 DEBUG: All validations passed, yielding complete event...");

    yield writeEvent("complete", {
      workflow: {
        workflowId,
        planning: planningOutput,
        research: researchOutput,
        answer: { ...parsedAnswer, answer: finalAnswerText },
        metadata: {
          totalDuration: Date.now() - startTime,
          timestamp: Date.now(),
        },
      },
    });

    console.log("🔍 DEBUG: Converting context references...");
    const contextReferences = convertToContextReferences(
      (researchOutput.sourcesUsed || []) as Array<{
        contextId: string;
        type: "search_result" | "scraped_page";
        url: string;
        title: string;
        relevance: "high" | "medium" | "low";
      }>,
    );
    console.log(
      "🔍 DEBUG: Converted",
      contextReferences.length,
      "context references",
    );

    yield writeEvent("metadata", {
      metadata: {
        workflowId,
        contextReferences,
        hasLimitations: parsedAnswer.hasLimitations,
        confidence: parsedAnswer.confidence,
        answerLength: finalAnswerText.length,
      },
      nonce,
    });

    // Generate and update chat title using refined intent from planning
    // The 25-char limit is enforced by generateChatTitle utility
    const generatedTitle = generateChatTitle({
      intent: planningOutput?.userIntent || args.userQuery,
    });

    // Only update if title hasn't been customized (still default or matches generated)
    if (chat.title === "New Chat" || !chat.title) {
      await ctx.runMutation(internal.chats.internalUpdateChatTitle, {
        chatId: args.chatId,
        title: generatedTitle,
      });
    }

    console.log("🔍 DEBUG: Saving assistant message...");
    const assistantMessageId: Id<"messages"> = (await ctx.runMutation(
      internal.messages.addMessage,
      {
        chatId: args.chatId,
        role: "assistant",
        content: finalAnswerText,
        searchResults: contextReferences
          .filter(
            (ref): ref is ResearchContextReference & { url: string } =>
              typeof ref.url === "string" && ref.url.length > 0,
          )
          .map((ref) => ({
            title: ref.title || ref.url || "",
            url: ref.url,
            snippet: "",
            relevanceScore: ref.relevanceScore ?? 0.5,
          })),
        sources: parsedAnswer.sourcesUsed || [],
        contextReferences,
        workflowId,
        isStreaming: false,
        sessionId: args.sessionId, // Pass sessionId for HTTP action auth
      },
    )) as Id<"messages">;

    const persistedPayload: StreamingPersistPayload = {
      assistantMessageId,
      workflowId,
      answer: finalAnswerText,
      sources: parsedAnswer.sourcesUsed || [],
      contextReferences,
    };

    const signature = await ctx.runAction(
      internal.workflowTokensActions.signPersistedPayload,
      {
        payload: persistedPayload,
        nonce,
      },
    );
    if (workflowTokenId) {
      await ctx.runMutation(internal.workflowTokens.completeToken, {
        tokenId: workflowTokenId,
        signature,
      });
    }

    yield writeEvent("persisted", {
      payload: persistedPayload,
      nonce,
      signature,
    });
  } catch (error) {
    const stage =
      error instanceof Error && error.message.includes("Planning failed")
        ? "planning"
        : error instanceof Error && error.message.includes("Research failed")
          ? "research"
          : error instanceof Error && error.message.includes("Synthesis failed")
            ? "synthesis"
            : "unknown";

    await handleError(
      error instanceof Error ? error : new Error("An unknown error occurred"),
      stage,
    );
  }
}
