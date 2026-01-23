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

// ============================================
// Timeout Utilities
// ============================================
// Agent calls have no built-in timeout, so we wrap them to prevent indefinite hangs.

const AGENT_TIMEOUT_MS = 60_000; // 60 seconds per agent stage
const TOOL_EXECUTION_TIMEOUT_MS = 120_000; // 120 seconds for research stage (includes tool calls)

// ============================================
// Instant Response Detection
// ============================================
// Skip ALL LLM calls for obvious conversational messages that don't need research.
// These patterns match greetings, tests, and simple chat messages.

const INSTANT_RESPONSES: Record<string, string> = {
  greeting:
    "Hello! I'm ready to help you search and research any topic. What would you like to know?",
  test: "Test confirmed! This chat is working. What would you like to research?",
  thanks: "You're welcome! Let me know if you need anything else.",
  goodbye: "Goodbye! Feel free to start a new chat anytime.",
  confirm: "Got it. What would you like to know?",
  help: "I'm a research assistant that can search the web and find information for you. Just ask me a question about any topic!",
};

function detectInstantResponse(query: string): string | null {
  const trimmed = query.trim().toLowerCase();

  // Greeting patterns
  if (/^(hi|hello|hey|howdy|greetings|yo)[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.greeting;
  }
  if (/^(good\s*(morning|afternoon|evening|night))[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.greeting;
  }

  // Test patterns
  if (
    /^(test|testing|this is a test|new chat|start)[\s!.,?]*$/i.test(trimmed)
  ) {
    return INSTANT_RESPONSES.test;
  }
  if (/^this is a new chat[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.test;
  }

  // Thanks patterns
  if (/^(thanks|thank you|thx|ty)[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.thanks;
  }

  // Goodbye patterns
  if (/^(bye|goodbye|see you|later|cya)[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.goodbye;
  }

  // Confirmation patterns
  if (/^(ok|okay|sure|yes|no|yep|nope|yeah|nah)[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.confirm;
  }

  // Help patterns
  if (/^(help|help me|\?)[\s!.,?]*$/i.test(trimmed)) {
    return INSTANT_RESPONSES.help;
  }

  return null;
}

class AgentTimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super(`Agent ${stage} timed out after ${timeoutMs}ms`);
    this.name = "AgentTimeoutError";
  }
}

/**
 * Wrap an async operation with a timeout.
 * Properly cleans up the timer when the operation completes to prevent resource leaks.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: string,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new AgentTimeoutError(stage, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // Always clear the timer to prevent resource leaks
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}
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
    const planningResult = await withTimeout(
      run(agents.queryPlanner, planningInput, {
        context: { actionCtx: ctx },
      }),
      AGENT_TIMEOUT_MS,
      "planning",
    );
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

      const researchResult = await withTimeout(
        run(agents.research, researchInstructions, {
          context: { actionCtx: ctx },
        }),
        TOOL_EXECUTION_TIMEOUT_MS,
        "research",
      );
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

    const synthesisResult = await withTimeout(
      run(agents.answerSynthesis, synthesisInstructions, {
        context: { actionCtx: ctx },
      }),
      AGENT_TIMEOUT_MS,
      "synthesis",
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

  // ============================================
  // INSTANT RESPONSE PATH (No LLM calls)
  // ============================================
  // For obvious greetings/tests, respond instantly without any agent calls.
  // This reduces response time from 5-16 seconds to <500ms.

  const instantResponse = detectInstantResponse(args.userQuery);
  if (instantResponse) {
    try {
      console.log(
        "⚡ INSTANT RESPONSE: Skipping all agent calls for simple message",
      );

      yield writeEvent("progress", {
        stage: "generating",
        message: "Responding...",
      });

      yield writeEvent("content", { delta: instantResponse });

      yield writeEvent("complete", {
        workflow: {
          workflowId,
          planning: {
            userIntent: "Simple conversational message - no research needed",
            informationNeeded: [],
            searchQueries: [],
            needsWebScraping: false,
            confidenceLevel: 1,
          },
          research: {
            researchSummary: "No research required.",
            keyFindings: [],
            sourcesUsed: [],
            researchQuality: "adequate",
          },
          answer: {
            answer: instantResponse,
            hasLimitations: false,
            sourcesUsed: [],
            answerCompleteness: "complete",
            confidence: 1,
          },
          metadata: {
            totalDuration: Date.now() - startTime,
            timestamp: Date.now(),
          },
        },
      });

      yield writeEvent("metadata", {
        metadata: {
          workflowId,
          contextReferences: [],
          hasLimitations: false,
          confidence: 1,
          answerLength: instantResponse.length,
        },
        nonce,
      });

      // Update chat title
      const generatedTitle = generateChatTitle({ intent: args.userQuery });
      if (chat.title === "New Chat" || !chat.title) {
        await ctx.runMutation(internal.chats.internalUpdateChatTitle, {
          chatId: args.chatId,
          title: generatedTitle,
        });
      }

      // Save assistant message
      const instantMessageId: Id<"messages"> = (await ctx.runMutation(
        internal.messages.addMessage,
        {
          chatId: args.chatId,
          role: "assistant",
          content: instantResponse,
          searchResults: [],
          sources: [],
          contextReferences: [],
          workflowId,
          isStreaming: false,
          sessionId: args.sessionId,
        },
      )) as Id<"messages">;

      const instantPayload: StreamingPersistPayload = {
        assistantMessageId: instantMessageId,
        workflowId,
        answer: instantResponse,
        sources: [],
        contextReferences: [],
      };

      const instantSignature = await ctx.runAction(
        internal.workflowTokensActions.signPersistedPayload,
        { payload: instantPayload, nonce },
      );

      if (workflowTokenId) {
        await ctx.runMutation(internal.workflowTokens.completeToken, {
          tokenId: workflowTokenId,
          signature: instantSignature,
        });
      }

      yield writeEvent("persisted", {
        payload: instantPayload,
        nonce,
        signature: instantSignature,
      });

      return; // Exit - no agent calls needed
    } catch (error) {
      // Ensure workflow token is invalidated on failure
      await handleError(
        error instanceof Error ? error : new Error("Instant response failed"),
        "instant",
      );
    }
  }

  try {
    yield writeEvent("progress", {
      stage: "planning",
      message: "Analyzing your question and planning research strategy...",
    });

    const planningStart = Date.now();
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
    await withTimeout(planningResult.completed, AGENT_TIMEOUT_MS, "planning");
    const planningDuration = Date.now() - planningStart;
    console.log(
      `⚡ PLANNING COMPLETE: ${planningDuration}ms | queries: ${planningResult.finalOutput?.searchQueries?.length || 0}`,
    );

    planningOutput = planningResult.finalOutput;

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
    const informationNeededCount =
      planningOutput.informationNeeded?.length || 0;
    const needsResearch =
      searchQueriesCount > 0 ||
      informationNeededCount > 0 ||
      planningOutput.needsWebScraping;

    // FAST PATH: Simple conversational messages that don't need research
    // Skip research stage entirely when planning indicates no information gathering needed
    if (!needsResearch && planningOutput.confidenceLevel >= 0.9) {
      console.log("⚡ FAST PATH: Skipping research stage for simple message");

      yield writeEvent("progress", {
        stage: "generating",
        message: "Generating response...",
      });

      // Apply enhancement rules for synthesis
      const synthesisEnhancements = applyEnhancements(args.userQuery, {
        enhanceContext: true,
        enhanceSystemPrompt: true,
      });

      const fastSynthesisInstructions = buildSynthesisInstructions({
        userQuery: args.userQuery,
        userIntent: planningOutput.userIntent,
        researchSummary:
          "No research required for this conversational message.",
        keyFindings: [],
        sourcesUsed: [],
        informationGaps: undefined,
        scrapedContent: undefined,
        serpEnrichment: undefined,
        enhancedContext: synthesisEnhancements.enhancedContext || undefined,
        enhancedSystemPrompt:
          synthesisEnhancements.enhancedSystemPrompt || undefined,
      });

      const fastSynthesisResult = await run(
        agents.answerSynthesis,
        fastSynthesisInstructions,
        { stream: true, context: { actionCtx: ctx } },
      );

      let fastAccumulatedAnswer = "";
      for await (const event of fastSynthesisResult) {
        if (event.type === "run_item_stream_event") {
          const item = event.item as any;
          const eventName = (event as any).name;
          if (eventName === "message_output_created") continue;
          const delta =
            item?.delta?.content || item?.content_delta || item?.text_delta;
          if (delta && typeof delta === "string" && delta.length > 0) {
            fastAccumulatedAnswer += delta;
            yield writeEvent("content", { delta });
          }
        }
      }

      await withTimeout(
        fastSynthesisResult.completed,
        AGENT_TIMEOUT_MS,
        "synthesis",
      );
      const fastSynthesisOutput = fastSynthesisResult.finalOutput as string;

      if (!fastSynthesisOutput || fastSynthesisOutput.trim().length === 0) {
        throw new Error("Fast synthesis failed: agent returned empty output.");
      }

      const fastParsedAnswer = parseAnswerText(fastSynthesisOutput);
      const fastFinalAnswerText =
        fastParsedAnswer.answer || fastAccumulatedAnswer;

      if (
        fastAccumulatedAnswer.length === 0 &&
        fastFinalAnswerText.length > 0
      ) {
        yield writeEvent("content", { delta: fastFinalAnswerText });
      }

      yield writeEvent("complete", {
        workflow: {
          workflowId,
          planning: planningOutput,
          research: {
            researchSummary:
              "No research required for this conversational message.",
            keyFindings: [],
            sourcesUsed: [],
            researchQuality: "adequate",
          },
          answer: { ...fastParsedAnswer, answer: fastFinalAnswerText },
          metadata: {
            totalDuration: Date.now() - startTime,
            timestamp: Date.now(),
          },
        },
      });

      yield writeEvent("metadata", {
        metadata: {
          workflowId,
          contextReferences: [],
          hasLimitations: fastParsedAnswer.hasLimitations,
          confidence: fastParsedAnswer.confidence,
          answerLength: fastFinalAnswerText.length,
        },
        nonce,
      });

      // Update chat title if needed
      const generatedTitle = generateChatTitle({
        intent: planningOutput?.userIntent || args.userQuery,
      });
      if (chat.title === "New Chat" || !chat.title) {
        await ctx.runMutation(internal.chats.internalUpdateChatTitle, {
          chatId: args.chatId,
          title: generatedTitle,
        });
      }

      // Save assistant message
      const fastAssistantMessageId: Id<"messages"> = (await ctx.runMutation(
        internal.messages.addMessage,
        {
          chatId: args.chatId,
          role: "assistant",
          content: fastFinalAnswerText,
          searchResults: [],
          sources: fastParsedAnswer.sourcesUsed || [],
          contextReferences: [],
          workflowId,
          isStreaming: false,
          sessionId: args.sessionId,
        },
      )) as Id<"messages">;

      const fastPersistedPayload: StreamingPersistPayload = {
        assistantMessageId: fastAssistantMessageId,
        workflowId,
        answer: fastFinalAnswerText,
        sources: fastParsedAnswer.sourcesUsed || [],
        contextReferences: [],
      };

      const fastSignature = await ctx.runAction(
        internal.workflowTokensActions.signPersistedPayload,
        { payload: fastPersistedPayload, nonce },
      );

      if (workflowTokenId) {
        await ctx.runMutation(internal.workflowTokens.completeToken, {
          tokenId: workflowTokenId,
          signature: fastSignature,
        });
      }

      yield writeEvent("persisted", {
        payload: fastPersistedPayload,
        nonce,
        signature: fastSignature,
      });

      return; // Exit early - don't run full research path
    }

    // ============================================
    // PARALLEL EXECUTION PATH (FAST)
    // ============================================
    // Execute ALL searches and scrapes in parallel upfront.
    // This eliminates the 8-13 second LLM "thinking" gaps between tool calls.
    // Total research phase should complete in ~2-3 seconds instead of 30-60 seconds.

    // Initialize harvested data container
    const harvested: HarvestedToolData = {
      scrapedContent: [],
      serpEnrichment: {},
      searchResults: [],
    };

    const parallelStartTime = Date.now();

    if (searchQueriesCount > 0) {
      yield writeEvent("progress", {
        stage: "searching",
        message: `Searching ${searchQueriesCount} ${searchQueriesCount === 1 ? "query" : "queries"} in parallel...`,
        queries: planningOutput.searchQueries.map((q: any) => q.query),
      });

      // Execute ALL searches in parallel
      console.log(
        `⚡ PARALLEL SEARCH: Executing ${searchQueriesCount} searches simultaneously...`,
      );

      const searchPromises = planningOutput.searchQueries.map(
        async (sq: { query: string; reasoning: string; priority: number }) => {
          const searchStart = Date.now();
          try {
            // @ts-ignore - ActionCtx type mismatch
            const result = await ctx.runAction(api.search.searchWeb, {
              query: sq.query,
              maxResults: 8,
            });
            console.log(
              `✅ PARALLEL SEARCH [${Date.now() - searchStart}ms]: "${sq.query}" → ${result.results?.length || 0} results`,
            );
            return { query: sq.query, result, error: null };
          } catch (error) {
            console.error(`❌ PARALLEL SEARCH FAILED: "${sq.query}"`, error);
            return { query: sq.query, result: null, error };
          }
        },
      );

      const searchResults = await Promise.all(searchPromises);

      // Harvest all search results
      for (const { query, result } of searchResults) {
        if (!result?.results) continue;

        for (const r of result.results) {
          harvested.searchResults.push({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            relevanceScore: r.relevanceScore || 0.5,
          });
        }

        // Harvest enrichment from first successful search with enrichment
        if (
          result.enrichment &&
          Object.keys(harvested.serpEnrichment).length === 0
        ) {
          const enrich = result.enrichment;
          if (enrich.knowledgeGraph)
            harvested.serpEnrichment.knowledgeGraph = enrich.knowledgeGraph;
          if (enrich.answerBox)
            harvested.serpEnrichment.answerBox = enrich.answerBox;
          if (enrich.peopleAlsoAsk)
            harvested.serpEnrichment.peopleAlsoAsk = enrich.peopleAlsoAsk;
          if (enrich.relatedSearches)
            harvested.serpEnrichment.relatedSearches = enrich.relatedSearches;
        }
      }

      console.log(
        `📊 PARALLEL SEARCH COMPLETE [${Date.now() - parallelStartTime}ms]: ${harvested.searchResults.length} total results`,
      );
    }

    // Deduplicate URLs and select top candidates for scraping
    const uniqueUrls = Array.from(
      new Map(harvested.searchResults.map((r) => [r.url, r])).values(),
    )
      .filter((r) => r.url && r.url.startsWith("http"))
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 4); // Scrape top 4 URLs max

    // Always scrape when URLs are available - planner's needsWebScraping prediction
    // can be wrong, and skipping scraping when search returns good URLs degrades answer quality.
    // The research agent instructions mandate "MUST scrape AT LEAST 2 URLs".
    if (uniqueUrls.length > 0) {
      yield writeEvent("progress", {
        stage: "scraping",
        message: `Reading ${uniqueUrls.length} sources in parallel...`,
        urls: uniqueUrls.map((u) => u.url),
      });

      console.log(
        `⚡ PARALLEL SCRAPE: Fetching ${uniqueUrls.length} URLs simultaneously...`,
      );
      const scrapeStart = Date.now();

      // Execute ALL scrapes in parallel
      const scrapePromises = uniqueUrls.map(async (urlInfo) => {
        const url = urlInfo.url;
        const contextId = generateMessageId();
        const singleScrapeStart = Date.now();

        try {
          const content = await ctx.runAction(
            api.search.scraperAction.scrapeUrl,
            { url },
          );

          // Skip if we got an error response or minimal content
          if (content.content.length < 100) {
            console.log(
              `⚠️ PARALLEL SCRAPE SKIP [${Date.now() - singleScrapeStart}ms]: ${url} (too short: ${content.content.length} chars)`,
            );
            return null;
          }

          console.log(
            `✅ PARALLEL SCRAPE [${Date.now() - singleScrapeStart}ms]: ${url} → ${content.content.length} chars`,
          );

          const scraped: ScrapedContent = {
            url,
            title: content.title,
            content: content.content,
            summary: content.summary || content.content.substring(0, 500),
            contentLength: content.content.length,
            scrapedAt: Date.now(),
            contextId,
            relevanceScore: urlInfo.relevanceScore || 0.85,
          };
          return scraped;
        } catch (error) {
          console.error(
            `❌ PARALLEL SCRAPE FAILED [${Date.now() - singleScrapeStart}ms]: ${url}`,
            error,
          );
          return null;
        }
      });

      const scrapeResults = await Promise.all(scrapePromises);
      const successfulScrapes = scrapeResults.filter(
        (r): r is ScrapedContent => r !== null,
      );
      harvested.scrapedContent.push(...successfulScrapes);

      console.log(
        `📊 PARALLEL SCRAPE COMPLETE [${Date.now() - scrapeStart}ms]: ${successfulScrapes.length}/${uniqueUrls.length} pages`,
      );
    }

    const totalParallelTime = Date.now() - parallelStartTime;
    console.log(
      `⚡ TOTAL PARALLEL EXECUTION: ${totalParallelTime}ms (searches + scrapes)`,
    );

    // Build synthetic key findings from scraped content summaries.
    // This provides structured context for synthesis without an additional LLM call.
    const syntheticKeyFindings = harvested.scrapedContent
      .filter((scraped) => scraped.summary && scraped.summary.length > 50)
      .slice(0, 5) // Limit to top 5 to avoid overwhelming synthesis
      .map((scraped) => ({
        finding:
          scraped.summary.length > 300
            ? scraped.summary.substring(0, 297) + "..."
            : scraped.summary,
        sources: [scraped.url],
        confidence:
          (scraped.relevanceScore ?? 0) >= 0.8
            ? "high"
            : (scraped.relevanceScore ?? 0) >= 0.5
              ? "medium"
              : "low",
      }));

    // Build research output directly from harvested data (skip research agent entirely)
    const researchOutput: any = {
      researchSummary:
        harvested.searchResults.length > 0
          ? `Found ${harvested.searchResults.length} search results and scraped ${harvested.scrapedContent.length} pages.`
          : "No search results found.",
      keyFindings: syntheticKeyFindings,
      sourcesUsed: [],
      informationGaps: undefined,
      scrapedContent: harvested.scrapedContent,
      serpEnrichment:
        Object.keys(harvested.serpEnrichment).length > 0
          ? harvested.serpEnrichment
          : undefined,
      researchQuality:
        harvested.scrapedContent.length >= 2
          ? "comprehensive"
          : harvested.scrapedContent.length >= 1
            ? "adequate"
            : "limited",
    };

    // Build sourcesUsed from harvested data
    const scrapedUrlMap = new Map(
      harvested.scrapedContent.map((s) => [s.url, s]),
    );
    const sources = harvested.searchResults.map((r) => {
      const scraped = scrapedUrlMap.get(r.url);
      return {
        url: r.url,
        title: r.title,
        contextId: scraped ? scraped.contextId : generateMessageId(),
        type: scraped ? ("scraped_page" as const) : ("search_result" as const),
        relevance:
          r.relevanceScore > 0.7 ? ("high" as const) : ("medium" as const),
      };
    });
    // Dedup by URL
    researchOutput.sourcesUsed = Array.from(
      new Map(sources.map((s) => [s.url, s])).values(),
    );

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
    const synthesisStreamStart = Date.now();
    for await (const event of synthesisResult) {
      if (event.type === "run_item_stream_event") {
        const item = event.item as any;
        const eventName = (event as any).name;

        // Skip full content events, only capture deltas
        if (eventName === "message_output_created") continue;

        // Look for actual streaming deltas
        const delta =
          item?.delta?.content ||
          item?.content_delta ||
          item?.text_delta ||
          (eventName?.includes("delta") && item?.content);

        if (delta && typeof delta === "string" && delta.length > 0) {
          accumulatedAnswer += delta;
          yield writeEvent("content", { delta });
        }
      }
    }
    console.log(
      `⚡ SYNTHESIS STREAMING: ${Date.now() - synthesisStreamStart}ms`,
    );

    // CRITICAL: Await stream completion before accessing finalOutput
    const synthesisCompleteStart = Date.now();
    await withTimeout(synthesisResult.completed, AGENT_TIMEOUT_MS, "synthesis");
    console.log(
      `⚡ SYNTHESIS COMPLETE: ${Date.now() - synthesisCompleteStart}ms`,
    );

    const synthesisOutput = synthesisResult.finalOutput as string;
    if (!synthesisOutput || synthesisOutput.trim().length === 0) {
      throw new Error("Synthesis failed: agent returned empty or null output.");
    }

    const parsedAnswer = parseAnswerText(synthesisOutput);
    const finalAnswerText = parsedAnswer.answer || accumulatedAnswer;

    // If no content was streamed, send the final answer now
    if (accumulatedAnswer.length === 0 && finalAnswerText.length > 0) {
      console.log(
        "⚠️ No streaming deltas captured, sending final answer as single event",
      );
      yield writeEvent("content", { delta: finalAnswerText });
    }

    // Validate outputs before yielding to Convex
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

    const contextReferences = convertToContextReferences(
      (researchOutput.sourcesUsed || []) as Array<{
        contextId: string;
        type: "search_result" | "scraped_page";
        url: string;
        title: string;
        relevance: "high" | "medium" | "low";
      }>,
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

    const totalDuration = Date.now() - startTime;
    console.log(
      `🏁 WORKFLOW COMPLETE: ${totalDuration}ms total | ${harvested.searchResults.length} results | ${harvested.scrapedContent.length} pages | ${finalAnswerText.length} chars`,
    );

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
