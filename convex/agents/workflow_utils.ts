"use node";

import { MaxTurnsExceededError } from "@openai/agents";
import { AGENT_LIMITS } from "../lib/constants/cache";
import { logWorkflow, logWorkflowError } from "./workflow_logger";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { WorkflowActionCtx } from "./orchestration_persistence";

// ============================================
// CustomEvent Polyfill
// ============================================

interface CustomEventParams<T> {
  detail?: T;
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
}

interface CustomEventConstructor {
  new <T>(type: string, params?: CustomEventParams<T>): CustomEvent<T>;
}

interface GlobalWithCustomEvent {
  CustomEvent?: CustomEventConstructor;
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
      constructor(type: string, params?: CustomEventParams<T>) {
        super(type, params);
        this.detail = params?.detail as T;
      }
    }
    global.CustomEvent = NodeCustomEvent as unknown as CustomEventConstructor;
  } catch (extendError) {
    // Fallback for environments where Event is not extendable
    console.warn(
      "CustomEvent polyfill: Event not extendable, using standalone fallback class",
      { error: extendError },
    );
    class NodeCustomEvent<T = unknown> {
      type: string;
      detail: T;
      constructor(type: string, params?: CustomEventParams<T>) {
        this.type = type;
        this.detail = params?.detail as T;
      }
    }
    global.CustomEvent = NodeCustomEvent as unknown as CustomEventConstructor;
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
      `${workflowName} failed: too many tool errors (${errorCount})`,
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
