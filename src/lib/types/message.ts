/**
 * Message Type Definitions
 * Uses Convex's auto-generated types directly (Doc<"messages">) for server data
 * Defines LocalMessage only for localStorage-specific needs
 * Complies with AGENT.md: NO redundant type definitions for Convex entities
 */

import type { Doc, Id } from "../../../convex/_generated/dataModel";

/**
 * Search result structure (shared between local and server)
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}

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
 * Prepare local message for migration to Convex
 * Removes local-only fields that shouldn't be stored in database
 */
export const prepareMessageForMigration = (
  message: LocalMessage,
): Omit<LocalMessage, "_id" | "isLocal" | "source" | "hasStartedContent"> => {
  const {
    _id: _localId,
    isLocal: _isLocal,
    source: _source,
    hasStartedContent: _hasStarted,
    ...convexCompatible
  } = message;
  return convexCompatible;
};

/**
 * Message stream chunk for real-time updates
 */
export interface MessageStreamChunk {
  type: "content" | "metadata" | "error" | "done" | "chunk";
  content?: string;
  thinking?: string;
  metadata?: Partial<Message>;
  error?: string;
}

/**
 * Search progress state for UI updates
 */
export interface SearchProgress {
  stage: "searching" | "scraping" | "analyzing" | "generating";
  message: string;
  urls?: string[];
  currentUrl?: string;
}

/**
 * Migration mapping for tracking local to server ID changes
 */
export interface MessageMigrationMapping {
  localId: string;
  serverId: Id<"messages">;
}
