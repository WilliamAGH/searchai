/**
 * Message Type Definitions
 *
 * Uses Convex's auto-generated types directly and normalizes to UI-safe IDs.
 * Complies with AGENTS.md: single path, no legacy types.
 */

import type { Doc } from "../../../convex/_generated/dataModel";
// Import from the dedicated types module (not orchestration_helpers) so we don't pull
// any Node-only helpers into browser bundles.
import type { StreamingPersistPayload } from "../../../convex/schemas/agents";
export type {
  WebResearchSourceClient,
  MessageMetadata,
} from "@/lib/schemas/messageStream";

/**
 * Workflow progress stages for search/response process.
 * "idle" is UI-only initial state; active stages are used in stream events.
 *
 * @see {@link ../../../convex/agents/streaming_helpers.ts} ProgressStage (backend subset)
 */
export const WORKFLOW_STAGES = [
  "idle",
  "thinking",
  "planning",
  "searching",
  "scraping",
  "analyzing",
  "generating",
  "finalizing",
] as const;

/** All workflow stages including idle (UI state) */
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

/** Active workflow stages (excludes idle - used in stream events) */
export type ActiveWorkflowStage = Exclude<WorkflowStage, "idle">;

/**
 * UI-specific message fields for streaming state tracking.
 * These fields are NOT persisted to Convex - they exist only in UI state.
 */
export interface UIMessageFields {
  /** Workflow nonce for signature verification (UI-only) */
  workflowNonce?: string;
  /** Workflow signature for verification (UI-only) */
  workflowSignature?: string;
  /** Whether the message has been confirmed persisted (UI-only) */
  persisted?: boolean;
}

/**
 * Canonical UI message type (single path).
 * Convex Ids are string-backed, so we normalize to string IDs in UI state.
 */
export type Message = Omit<
  Doc<"messages">,
  | "_id"
  | "chatId"
  | "reasoning"
  | "contextReferences"
  | "searchResults"
  | "sources"
> & {
  _id: string;
  chatId: string;
  webResearchSources?: WebResearchSourceClient[];
  reasoning?: string;
} & UIMessageFields;

export type MessageStreamChunk =
  | { type: "content"; content?: string; delta?: string } // Answer content (with optional delta)
  | {
      type: "progress";
      stage: ActiveWorkflowStage;
      message: string;
      urls?: string[];
      currentUrl?: string;
      queries?: string[];
      sourcesUsed?: number;
      /** LLM's schema-enforced reasoning for this tool call (model-agnostic) */
      toolReasoning?: string;
      /** Search query being executed */
      toolQuery?: string;
      /** URL being scraped */
      toolUrl?: string;
    }
  | { type: "reasoning"; content: string } // Thinking/reasoning from agents
  | { type: "metadata"; metadata: MessageMetadata; nonce?: string } // Final metadata (sources, etc.)
  | { type: "complete"; workflow?: unknown } // Workflow completion
  | { type: "error"; error: string } // Error events
  | {
      type: "workflow_start";
      workflowId: string;
      nonce: string;
    } // Workflow initialization event
  | {
      type: "persisted";
      payload: StreamingPersistPayload;
      nonce: string;
      signature: string;
    }; // Database persistence confirmation with security metadata

/**
 * Search progress state for UI updates
 * Extended to support planning stage and additional metadata
 */
export interface SearchProgress {
  stage: WorkflowStage;
  message?: string;
  urls?: string[];
  currentUrl?: string;
  queries?: string[];
  sourcesUsed?: number;
  /** LLM's schema-enforced reasoning for this tool call (model-agnostic) */
  toolReasoning?: string;
  /** Search query being executed */
  toolQuery?: string;
  /** URL being scraped */
  toolUrl?: string;
}

/**
 * Factory for creating local UI messages (not yet persisted to Convex).
 * Use this instead of inline object literals to ensure type safety.
 */
export function createLocalUIMessage(params: {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  reasoning?: string;
  webResearchSources?: WebResearchSourceClient[];
  imageStorageIds?: string[];
}): Message {
  const now = Date.now();
  return {
    _id: params.id,
    _creationTime: now,
    chatId: params.chatId,
    role: params.role,
    content: params.content,
    timestamp: now,
    // Optional fields
    isStreaming: params.isStreaming,
    reasoning: params.reasoning,
    webResearchSources: params.webResearchSources ?? [],
    imageStorageIds: params.imageStorageIds,
  };
}

/**
 * Pagination state for message loading
 * Groups related pagination fields to reduce prop drilling
 */
export interface PaginationState {
  /** Whether more messages are being loaded */
  isLoadingMore: boolean;
  /** Whether there are more messages to load */
  hasMore: boolean;
  /** Callback to load more messages */
  onLoadMore?: () => Promise<void>;
  /** Whether initial messages are loading */
  isLoadingMessages: boolean;
  /** Error from pagination operations */
  loadError: Error | null;
  /** Number of retry attempts for failed loads */
  retryCount: number;
  /** Callback to clear pagination error */
  onClearError?: () => void;
}
