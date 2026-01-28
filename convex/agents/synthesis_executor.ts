"use node";

/**
 * Unified Synthesis Executor
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Consolidates fast path and full synthesis workflows into one generator.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 */

import { run } from "@openai/agents";
import { applyEnhancements } from "../enhancements";
import { parseAnswerText, stripTrailingSources } from "./answerParser";
import { buildSynthesisInstructions } from "./orchestration_helpers";
import { AGENT_TIMEOUTS, AGENT_LIMITS } from "../lib/constants/cache";
import { processStreamForDeltas } from "./streaming_processor_helpers";
import type { AgentStreamResult } from "./streaming_processor_types";
import type { HarvestedData } from "../schemas/agents";
import type { ScrapedContent, SerpEnrichment } from "../schemas/search";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import { logWorkflow, logSynthesisComplete } from "./workflow_logger";

// ============================================
// Types
// ============================================

/**
 * Parsed answer structure from answerParser.
 */
export interface ParsedAnswer {
  answer: string;
  hasLimitations: boolean;
  limitations?: string;
  sourcesUsed: string[];
  answerCompleteness: "complete" | "partial" | "insufficient";
  confidence: number;
}

/**
 * Parameters for synthesis execution.
 */
export interface SynthesisParams {
  /** Convex action context */
  ctx: WorkflowActionCtx;

  /** The synthesis agent instance */
  synthesisAgent: Parameters<typeof run>[0];

  /** Original user query */
  userQuery: string;

  /** Refined user intent from planning */
  userIntent: string;

  /** Harvested research data (optional for fast path) */
  harvested?: HarvestedData;

  /** Pre-built research summary (optional) */
  researchSummary?: string;

  /** Pre-built key findings (optional) */
  keyFindings?: Array<{
    finding: string;
    sources: string[];
    confidence: string;
  }>;

  /** Sources used in research (optional) */
  sourcesUsed?: Array<{
    url: string;
    title: string;
    type: string;
    relevance: string;
  }>;

  /** Information gaps identified (optional) */
  informationGaps?: string[];

  /** Scraped content for synthesis (optional) */
  scrapedContent?: ScrapedContent[];

  /** SERP enrichment data (optional) */
  serpEnrichment?: SerpEnrichment;
}

/**
 * Result of synthesis execution.
 */
export interface SynthesisResult {
  /** The final answer text (stripped of trailing sources) */
  answer: string;

  /** Parsed answer with metadata */
  parsedAnswer: ParsedAnswer;

  /** Raw accumulated text from streaming */
  accumulatedAnswer: string;

  /** Time spent in synthesis */
  durationMs: number;
}

/**
 * Stream event from synthesis.
 */
export type SynthesisEvent =
  | { type: "progress"; stage: "generating"; message: string }
  | { type: "content"; delta: string };

// ============================================
// Timeout Utility
// ============================================

/**
 * Wrap a promise with a timeout.
 * Extracted for reuse from orchestration.ts.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: string,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`${stage} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

// ============================================
// Synthesis Executor
// ============================================

/**
 * Execute synthesis with streaming.
 *
 * This generator handles both fast path (no research) and full synthesis
 * workflows. It applies enhancements, builds synthesis instructions,
 * runs the synthesis agent, and yields content events.
 *
 * @param params - Synthesis parameters
 * @yields SynthesisEvent for progress and content updates
 * @returns SynthesisResult with the final answer
 *
 * @example
 * ```ts
 * // Fast path synthesis (no research)
 * const synthesis = executeSynthesis({
 *   ctx,
 *   synthesisAgent: agents.answerSynthesis,
 *   userQuery: args.userQuery,
 *   userIntent: planningOutput.userIntent,
 * });
 *
 * for await (const event of synthesis) {
 *   yield writeEvent(event.type, event);
 * }
 *
 * const result = await synthesis.next();
 * const { answer, parsedAnswer } = result.value;
 * ```
 */
export async function* executeSynthesis(
  params: SynthesisParams,
): AsyncGenerator<SynthesisEvent, SynthesisResult, undefined> {
  const {
    ctx,
    synthesisAgent,
    userQuery,
    userIntent,
    harvested,
    researchSummary = "No research required for this conversational message.",
    keyFindings = [],
    sourcesUsed = [],
    informationGaps,
    scrapedContent,
    serpEnrichment,
  } = params;

  const startTime = Date.now();

  yield {
    type: "progress",
    stage: "generating",
    message: "Writing response...",
  };

  // Apply enhancement rules for synthesis
  const synthesisEnhancements = applyEnhancements(userQuery, {
    enhanceContext: true,
    enhanceSystemPrompt: true,
  });

  // Determine scraped content to use
  // If provided directly, use that; otherwise fall back to harvested
  const effectiveScrapedContent =
    scrapedContent ?? harvested?.scrapedContent ?? [];

  // Determine SERP enrichment to use
  const effectiveSerpEnrichment =
    serpEnrichment ?? harvested?.serpEnrichment ?? undefined;

  // Build synthesis instructions
  const synthesisInstructions = buildSynthesisInstructions({
    userQuery,
    userIntent,
    researchSummary,
    keyFindings,
    sourcesUsed,
    informationGaps,
    scrapedContent: effectiveScrapedContent,
    serpEnrichment: effectiveSerpEnrichment,
    enhancedContext: synthesisEnhancements.enhancedContext || undefined,
    enhancedSystemPrompt:
      synthesisEnhancements.enhancedSystemPrompt || undefined,
  });

  // Run the synthesis agent with streaming
  const synthesisResult = await run(synthesisAgent, synthesisInstructions, {
    stream: true,
    context: { actionCtx: ctx },
    maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
  });

  // Process streaming events and accumulate answer
  let accumulatedAnswer = "";
  const streamResult: AgentStreamResult = synthesisResult;
  const streamProcessor = processStreamForDeltas(streamResult);

  for await (const event of streamProcessor) {
    accumulatedAnswer += event.delta;
    yield { type: "content", delta: event.delta };
  }

  // Wait for stream completion
  await withTimeout(
    synthesisResult.completed,
    AGENT_TIMEOUTS.AGENT_STAGE_MS,
    "synthesis",
  );

  const durationMs = Date.now() - startTime;

  // Get final output
  const rawOutput =
    typeof synthesisResult.finalOutput === "string"
      ? synthesisResult.finalOutput
      : accumulatedAnswer;

  // Validate output
  if (!rawOutput || rawOutput.trim().length === 0) {
    throw new Error("Synthesis failed: agent returned empty output.");
  }

  // Strip trailing sources and parse
  const strippedOutput = stripTrailingSources(rawOutput);
  const parsedAnswer = parseAnswerText(strippedOutput);

  // If no content was streamed, the final answer is the parsed one
  const finalAnswer = parsedAnswer.answer || accumulatedAnswer;

  // If nothing was streamed but we have a final answer, yield it now
  if (accumulatedAnswer.length === 0 && finalAnswer.length > 0) {
    logWorkflow(
      "SYNTHESIS_STREAMING",
      "No streaming deltas captured, sending final answer as single event",
    );
    yield { type: "content", delta: finalAnswer };
  }

  logSynthesisComplete(durationMs);

  return {
    answer: finalAnswer,
    parsedAnswer,
    accumulatedAnswer,
    durationMs,
  };
}

// ============================================
// Fast Path Helper
// ============================================

/**
 * Execute fast path synthesis (no research data).
 *
 * Convenience wrapper for synthesis with no research context.
 */
export async function* executeFastSynthesis(params: {
  ctx: WorkflowActionCtx;
  synthesisAgent: Parameters<typeof run>[0];
  userQuery: string;
  userIntent: string;
}): AsyncGenerator<SynthesisEvent, SynthesisResult, undefined> {
  return yield* executeSynthesis({
    ...params,
    researchSummary: "No research required for this conversational message.",
    keyFindings: [],
    sourcesUsed: [],
  });
}
