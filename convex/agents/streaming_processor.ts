"use node";

/**
 * Unified Stream Processing for OpenAI Agents SDK
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Consolidates stream processing loops into one reusable generator.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 * @see {@link ./streaming_tool_events.ts} - low-level event detection helpers
 */

import type { AgentStreamResult } from "./streaming_processor_types";
import type { ToolCallArgs } from "./streaming_event_types";
import {
  extractReasoningContent,
  isToolCallEvent,
  isToolOutputEvent,
  isReasoningEvent,
  extractToolName,
  extractToolArgs,
  extractTextDelta,
  extractToolOutput,
  extractOutputToolName,
} from "./streaming_tool_events";
import {
  getProgressStageForTool,
  getProgressMessage,
  type ProgressStage,
} from "./streaming_progress";
import type { HarvestedData } from "../schemas/agents";
import {
  hasToolContext,
  isToolError,
  harvestToolOutput,
} from "./streaming_processor_helpers";

// ============================================
// Stream Processor Configuration
// ============================================

/**
 * Callbacks for stream event processing.
 * All callbacks are optional - configure only what you need.
 */
export interface StreamProcessorCallbacks {
  /**
   * Called when reasoning/thinking content is emitted.
   * Useful for showing the agent's thought process before tool calls.
   */
  onReasoning?: (content: string) => void;

  /**
   * Called when a tool call is detected.
   * Return a ProgressStage to emit a progress event, or null to skip.
   */
  onToolCall?: (
    toolName: string,
    args: ToolCallArgs,
    currentStage: ProgressStage,
  ) => ProgressStage | null;

  /**
   * Called when a tool output is received.
   * Useful for logging or custom processing beyond harvesting.
   */
  onToolOutput?: (output: unknown, toolName: string) => void;

  /**
   * Called when a text delta is received.
   * The delta is the incremental text to append to the response.
   */
  onTextDelta?: (delta: string) => void;

  /**
   * Called when a tool output indicates an error.
   * Return true to continue processing, false to stop.
   */
  onToolError?: (toolName: string, errorCount: number) => boolean;
}

/**
 * Configuration for the stream processor.
 */
export interface StreamProcessorConfig {
  /** Callbacks for event handling */
  callbacks: StreamProcessorCallbacks;

  /** Whether to harvest tool outputs into HarvestedData */
  harvestData?: boolean;

  /** Initial progress stage (default: "thinking") */
  initialStage?: ProgressStage;

  /** Maximum tool errors before stopping (default: 3) */
  maxToolErrors?: number;
}

// ============================================
// Stream Processor Events
// ============================================

/**
 * Events yielded by the stream processor.
 * These are ready to be converted to SSE events via createWorkflowEvent.
 */
export type StreamProcessorEvent =
  | { type: "reasoning"; content: string }
  | {
      type: "progress";
      stage: ProgressStage;
      message: string;
      toolContext?: ToolCallArgs;
    }
  | { type: "content"; delta: string };

/**
 * Statistics collected during stream processing.
 */
export interface StreamProcessorStats {
  toolCallCount: number;
  toolErrorCount: number;
  accumulatedResponse: string;
  hasStartedStreaming: boolean;
  lastProgressStage: ProgressStage;
}

// ============================================
// Stream Processor Implementation
// ============================================

/**
 * Process an OpenAI Agent SDK streaming result.
 *
 * This is a generator function that yields events as they are processed.
 * It handles:
 * - Reasoning/thinking events
 * - Tool call detection and progress updates
 * - Tool output harvesting (optional)
 * - Text delta accumulation
 *
 * @param result - The StreamedRunResult from `run(agent, input, { stream: true })`
 * @param config - Configuration for processing behavior
 * @param harvested - Optional HarvestedData to populate with tool outputs
 *
 * @yields StreamProcessorEvent for each significant event
 * @returns StreamProcessorStats with final statistics
 */
export async function* processAgentStream(
  result: AgentStreamResult,
  config: StreamProcessorConfig,
  harvested?: HarvestedData,
): AsyncGenerator<StreamProcessorEvent, StreamProcessorStats, undefined> {
  const {
    callbacks,
    harvestData = false,
    initialStage = "thinking",
    maxToolErrors = 3,
  } = config;

  const stats: StreamProcessorStats = {
    toolCallCount: 0,
    toolErrorCount: 0,
    accumulatedResponse: "",
    hasStartedStreaming: false,
    lastProgressStage: initialStage,
  };

  for await (const event of result) {
    if (event.type === "raw_model_stream_event") {
      const delta = extractTextDelta(event);
      if (!delta) continue;

      if (!stats.hasStartedStreaming) {
        stats.hasStartedStreaming = true;
        yield {
          type: "progress",
          stage: "generating",
          message: getProgressMessage("generating"),
        };
      }

      stats.accumulatedResponse += delta;
      callbacks.onTextDelta?.(delta);
      yield { type: "content", delta };
      continue;
    }

    if (event.type !== "run_item_stream_event") {
      continue;
    }

    if (isReasoningEvent(event)) {
      const reasoningContent = extractReasoningContent(event.item);
      if (reasoningContent) {
        callbacks.onReasoning?.(reasoningContent);
        yield { type: "reasoning", content: reasoningContent };
      }
      continue;
    }

    if (isToolCallEvent(event)) {
      stats.toolCallCount++;
      const toolName = extractToolName(event.item);
      const toolArgs = extractToolArgs(event.item);

      const newStage = callbacks.onToolCall?.(
        toolName,
        toolArgs,
        stats.lastProgressStage,
      );

      const resolvedStage =
        newStage ?? getProgressStageForTool(toolName, stats.lastProgressStage);

      if (resolvedStage && resolvedStage !== stats.lastProgressStage) {
        stats.lastProgressStage = resolvedStage;
        yield {
          type: "progress",
          stage: resolvedStage,
          message: getProgressMessage(resolvedStage),
          toolContext: hasToolContext(toolArgs) ? toolArgs : undefined,
        };
      }
      continue;
    }

    if (isToolOutputEvent(event)) {
      const output = extractToolOutput(event.item);
      const outputToolName = extractOutputToolName(event.item);

      if (!output || typeof output !== "object") continue;

      if (isToolError(output)) {
        stats.toolErrorCount++;
        const shouldContinue = callbacks.onToolError?.(
          outputToolName,
          stats.toolErrorCount,
        );

        if (shouldContinue === false || stats.toolErrorCount >= maxToolErrors) {
          break;
        }
        continue;
      }

      callbacks.onToolOutput?.(output, outputToolName);

      if (harvestData && harvested) {
        harvestToolOutput(output, outputToolName, harvested);
      }
      continue;
    }
  }

  return stats;
}
