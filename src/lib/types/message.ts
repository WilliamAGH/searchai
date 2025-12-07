/**
 * Message Type Definitions
 * Uses Convex's auto-generated types directly (Doc<"messages">) for server data
 * Defines LocalMessage only for localStorage-specific needs
 * Complies with AGENT.md: NO redundant type definitions for Convex entities
 */

import type { Doc, Id } from "../../../convex/_generated/dataModel";
// Import from the dedicated types module (not orchestration_helpers) so we don't pull
// any Node-only helpers into browser bundles.
import type { StreamingPersistPayload } from "../../../convex/agents/types";
import type { SearchResult } from "../../../convex/lib/types/search";
export type { ResearchContextReference } from "../../../convex/agents/types";
export type { SearchResult } from "../../../convex/lib/types/search";

/**
 * Local message for unauthenticated users
 * Mimics Convex structure but stored in localStorage
 */
export interface LocalMessage {
  _id: string; // Local ID format: "msg_timestamp"
  chatId: string;
  role: "user" | "assistant" | "system";
  content?: string;
  timestamp?: number;

  // Search and AI metadata (matching Convex schema)
  searchResults?: SearchResult[];
  sources?: string[];
  reasoning?: string;
  searchMethod?: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults?: boolean;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;

  // Local-only metadata
  isLocal: true;
  source: "local";
  hasStartedContent?: boolean;
}

/**
 * Union type for components that work with both storage backends
 * Uses Doc<"messages"> directly for server data (no wrapper type)
 * Per AGENT.md: Leverage Convex's automatic type generation
 */
export type Message = LocalMessage | Doc<"messages">;

/**
 * Type guard to check if message is from localStorage
 */
export const isLocalMessage = (message: Message): message is LocalMessage => {
  return "isLocal" in message && message.isLocal === true;
};

/**
 * Type guard to check if message is from Convex
 * Checks for _creationTime which all Convex documents have
 */
export const isServerMessage = (
  message: Message,
): message is Doc<"messages"> => {
  return "_creationTime" in message;
};

/**
 * Type guard to check if ID is a local message ID
 */
export const isLocalMessageId = (id: string): boolean => {
  return id.startsWith("msg_") || id.startsWith("local_");
};

// REMOVED: convexMessageToMessage function - violates AGENT.md
// Doc<"messages"> should be used directly without wrapper types or conversions

/**
 * Create a new local message matching Convex structure
 */
export const createLocalMessage = (
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
): LocalMessage => {
  return {
    _id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    chatId,
    role,
    content,
    timestamp: Date.now(),
    isLocal: true,
    source: "local",
  };
};

/**
 * Message stream chunk for real-time updates
 * Extended to support agent workflow streaming events
 */
export type PersistedPayload = StreamingPersistPayload;

export type MessageStreamChunk =
  | { type: "chunk"; content: string } // Legacy: text content chunk
  | { type: "content"; content: string; delta?: string } // Answer content (with optional delta)
  | {
      type: "progress";
      stage: "planning" | "searching" | "scraping" | "analyzing" | "generating";
      message: string;
      urls?: string[];
      currentUrl?: string;
      queries?: string[];
      sourcesUsed?: number;
    }
  | { type: "reasoning"; content: string } // Thinking/reasoning from agents
  | { type: "tool_result"; toolName: string; result: string } // Tool execution results
  | { type: "metadata"; metadata: unknown; nonce?: string } // Final metadata (sources, etc.)
  | { type: "complete"; workflow?: unknown } // Workflow completion
  | { type: "error"; error: string } // Error events
  | { type: "done" } // Stream completion
  | {
      type: "persisted";
      payload: PersistedPayload;
      nonce: string;
      signature: string;
    }; // Database persistence confirmation with security metadata

/**
 * Search progress state for UI updates
 * Extended to support planning stage and additional metadata
 */
export interface SearchProgress {
  stage:
    | "idle"
    | "planning"
    | "searching"
    | "scraping"
    | "analyzing"
    | "generating";
  message?: string;
  urls?: string[];
  currentUrl?: string;
  queries?: string[];
  sourcesUsed?: number;
}

/**
 * Migration mapping for tracking local to server ID changes
 */
export interface MessageMigrationMapping {
  localId: string;
  serverId: Id<"messages">;
}
