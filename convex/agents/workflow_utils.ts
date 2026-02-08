"use node";

import { MaxTurnsExceededError } from "@openai/agents";
import { AGENT_LIMITS } from "../lib/constants/cache";
import { logWorkflow, logWorkflowError } from "./workflow_logger";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import type { SynthesisEvent } from "./synthesis_executor";
import type { ParallelResearchEvent } from "./parallel_research";
import type { WorkflowStreamEvent } from "./workflow_event_types";

// ============================================
// CustomEvent Polyfill
// ============================================

/**
 * CustomEvent polyfill for Node.js runtime.
 *
 * The OpenAI Agents SDK requires CustomEvent which isn't available in Node.js.
 * We provide a minimal polyfill that satisfies the SDK's usage pattern.
 *
 * Note: The type casts below are unavoidable because:
 * 1. TypeScript's CustomEvent<T> extends Event which has many DOM-specific properties
 * 2. Our polyfill only implements the subset needed by the Agents SDK
 * 3. There's no way to make TS believe our class fully implements CustomEvent<T>
 *
 * This is a documented exception to [RC1b] for runtime polyfills.
 */

interface CustomEventInit<T> {
  detail?: T;
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
}

// Minimal CustomEvent interface matching SDK usage
interface PolyfillCustomEvent<T = unknown> {
  type: string;
  detail: T;
}

interface PolyfillCustomEventConstructor {
  new <T>(type: string, init?: CustomEventInit<T>): PolyfillCustomEvent<T>;
}

interface GlobalWithCustomEvent {
  CustomEvent?: PolyfillCustomEventConstructor;
}

export const ensureCustomEventPolyfill = (): void => {
  const global = globalThis as GlobalWithCustomEvent;
  if (typeof global.CustomEvent !== "undefined") {
    return;
  }

  try {
    // Attempt to extend native Event (works in modern runtimes)
    class NodeCustomEvent<T = unknown> extends Event {
      detail: T;
      constructor(type: string, init?: CustomEventInit<T>) {
        super(type, init);
        this.detail = init?.detail as T;
      }
    }
    // Type assertion needed: NodeCustomEvent extends Event but TS can't verify
    // it matches the full DOM CustomEvent interface. Safe because SDK only uses
    // type and detail properties which our implementation provides.
    global.CustomEvent = NodeCustomEvent as PolyfillCustomEventConstructor;
  } catch (extendError) {
    // Fallback for environments where Event is not extendable
    console.warn(
      "CustomEvent polyfill: Event not extendable, using standalone fallback class",
      {
        error: extendError,
      },
    );
    class NodeCustomEvent<T = unknown> {
      type: string;
      detail: T;
      constructor(type: string, init?: CustomEventInit<T>) {
        this.type = type;
        this.detail = init?.detail as T;
      }
    }
    global.CustomEvent = NodeCustomEvent as PolyfillCustomEventConstructor;
  }
};

// ============================================
// Error & Limit Utilities
// ============================================

export function assertToolErrorThreshold(
  errorCount: number,
  workflowName: string,
): void {
  if (errorCount >= AGENT_LIMITS.MAX_TOOL_ERRORS) {
    throw new Error(
      `${workflowName} failed: too many tool errors (${errorCount}/${AGENT_LIMITS.MAX_TOOL_ERRORS})`,
    );
  }
}

interface WorkflowErrorHandlerConfig {
  ctx: WorkflowActionCtx;
  workflowId: string;
  getTokenId: () => Id<"workflowTokens"> | null;
}

export function createWorkflowErrorHandler(config: WorkflowErrorHandlerConfig) {
  const { ctx, workflowId, getTokenId } = config;
  return async (error: Error, stage: string): Promise<never> => {
    logWorkflowError("WORKFLOW_ERROR", `Stage: ${stage}`, {
      workflowId,
      error: error.message,
    });

    const tokenId = getTokenId();
    if (tokenId) {
      try {
        await ctx.runMutation(internal.workflowTokens.invalidateToken, {
          tokenId,
        });
      } catch (invalidationError) {
        console.error("Failed to invalidate workflow token", {
          tokenId,
          error:
            invalidationError instanceof Error
              ? invalidationError.message
              : "Unknown invalidation error",
        });
      }
    }

    throw error;
  };
}

export function handleMaxTurnsGracefully(
  error: MaxTurnsExceededError,
  context: {
    workflowId: string;
    workflowType: "conversational" | "research";
    accumulatedContent: string;
    toolCallCount: number;
    harvestedSearchResults: number;
    harvestedScrapedPages: number;
    maxTurns: number;
  },
): { partialOutput: string | null; wasRecovered: boolean } {
  logWorkflow("MAX_TURNS_EXCEEDED", "Attempting graceful recovery", {
    workflowId: context.workflowId,
    workflowType: context.workflowType,
    maxTurns: context.maxTurns,
    toolCallCount: context.toolCallCount,
    accumulatedContentLength: context.accumulatedContent.length,
    harvestedSearchResults: context.harvestedSearchResults,
    harvestedScrapedPages: context.harvestedScrapedPages,
    errorMessage: error.message,
    hasState: error.state !== undefined,
  });

  if (context.accumulatedContent.trim().length > 0) {
    logWorkflow("MAX_TURNS_RECOVERED", "Using accumulated content", {
      workflowId: context.workflowId,
      contentLength: context.accumulatedContent.length,
    });
    return {
      partialOutput: context.accumulatedContent,
      wasRecovered: true,
    };
  }

  if (context.harvestedSearchResults > 0 || context.harvestedScrapedPages > 0) {
    logWorkflow("MAX_TURNS_PARTIAL", "No text output but have harvested data", {
      workflowId: context.workflowId,
      harvestedSearchResults: context.harvestedSearchResults,
      harvestedScrapedPages: context.harvestedScrapedPages,
    });
    return {
      partialOutput: null,
      wasRecovered: false,
    };
  }

  logWorkflowError("MAX_TURNS_UNRECOVERABLE", "No content to use", {
    workflowId: context.workflowId,
  });
  return {
    partialOutput: null,
    wasRecovered: false,
  };
}

// ============================================
// Async Generator Utilities
// ============================================

type WriteEventFn = (
  type: string,
  data: Record<string, unknown>,
) => WorkflowStreamEvent;

/**
 * Transforms an async generator by applying a mapper to each yielded value.
 * Use with `yield*` to consume the generator and capture its return value.
 *
 * This avoids the common bug where for-await exhausts the generator
 * and subsequent .next() calls return undefined.
 *
 * @example
 * const result = yield* mapAsyncGenerator(gen, mapper);
 */
export async function* mapAsyncGenerator<TYieldIn, TYieldOut, TReturn>(
  source: AsyncGenerator<TYieldIn, TReturn, undefined>,
  mapper: (value: TYieldIn) => TYieldOut | null,
): AsyncGenerator<TYieldOut, TReturn, undefined> {
  try {
    while (true) {
      const { value, done } = await source.next();
      if (done) {
        return value;
      }
      const mapped = mapper(value);
      if (mapped !== null) {
        yield mapped;
      }
    }
  } finally {
    if (source.return) {
      // @ts-expect-error - AsyncGenerator return accepts optional values at runtime.
      await source.return();
    }
  }
}

/**
 * Maps synthesis events to workflow stream events.
 * Returns null for unrecognized event types (which are skipped).
 */
export function mapSynthesisEvent(
  event: SynthesisEvent,
  writeEvent: WriteEventFn,
): WorkflowStreamEvent | null {
  if (event.type === "progress") {
    return writeEvent("progress", {
      stage: event.stage,
      message: event.message,
    });
  }
  if (event.type === "content") {
    return writeEvent("content", { delta: event.delta });
  }
  return null;
}

/**
 * Maps parallel research events to workflow stream events.
 * Some events only log (search_complete, scrape_complete) and return null.
 */
export function mapResearchEvent(
  event: ParallelResearchEvent,
  writeEvent: WriteEventFn,
): WorkflowStreamEvent | null {
  if (event.type === "progress") {
    return writeEvent("progress", {
      stage: event.stage,
      message: event.message,
      ...(event.queries && { queries: event.queries }),
      ...(event.urls && { urls: event.urls }),
    });
  }
  if (event.type === "search_complete") {
    logWorkflow("PARALLEL_SEARCH_COMPLETE", `${event.resultCount} results`);
    return null;
  }
  if (event.type === "scrape_complete") {
    logWorkflow(
      "PARALLEL_SCRAPE_COMPLETE",
      `${event.successCount}/${event.successCount + event.failCount} pages`,
    );
    return null;
  }
  return null;
}
