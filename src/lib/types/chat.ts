/**
 * Chat Type Definitions
 * Uses Convex's auto-generated types directly (Doc<"chats">) for server data
 * Defines LocalChat only for localStorage-specific needs
 * Complies with AGENT.md: NO redundant type definitions for Convex entities
 */

import type { Doc, Id } from "../../../convex/_generated/dataModel";

/**
 * Local chat for unauthenticated users
 * Stored in localStorage, mimics Convex structure for easy migration
 * This is the ONLY custom type - server chats use Doc<"chats"> directly
 */
export interface LocalChat {
  _id: string; // Local ID format: "local_timestamp_random"
  title: string;
  createdAt: number;
  updatedAt: number;
  privacy: "private" | "shared" | "public";
  shareId?: string;
  publicId?: string;
  rollingSummary?: string;
  rollingSummaryUpdatedAt?: number;

  // Local-only metadata
  isLocal: true;
  source: "local";
}

/**
 * Union type for components that work with both storage backends
 * Uses Doc<"chats"> directly for server data (no wrapper type)
 * Per AGENT.md: Leverage Convex's automatic type generation
 */
export type Chat = LocalChat | Doc<"chats">;

/**
 * Type guard to check if chat is from localStorage
 */
export const isLocalChat = (chat: Chat): chat is LocalChat => {
  return "isLocal" in chat && chat.isLocal === true;
};

/**
 * Type guard to check if chat is from Convex
 * Checks for _creationTime which all Convex documents have
 */
export const isServerChat = (chat: Chat): chat is Doc<"chats"> => {
  return "_creationTime" in chat;
};

/**
 * Type guard to check if ID is a Convex ID
 * Convex IDs contain '|' character
 */
export const isConvexId = (id: string | Id<"chats">): id is Id<"chats"> => {
  return typeof id === "string" && id.includes("|");
};

/**
 * Type guard to check if ID is a local ID
 * Local IDs start with 'local_' or 'chat_'
 */
export const isLocalId = (id: string): boolean => {
  return id.startsWith("local_") || id.startsWith("chat_");
};

// REMOVED: convexChatToChat function - violates AGENT.md
// Doc<"chats"> should be used directly without wrapper types or conversions

/**
 * Create a new local chat matching Convex structure
 * Ensures compatibility when migrating to server
 */
export const createLocalChat = (title: string = "New Chat"): LocalChat => {
  const now = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9);

  return {
    _id: `local_${now}_${randomId}`,
    title,
    createdAt: now,
    updatedAt: now,
    privacy: "private",
    shareId: `share_${now}_${randomId}`,
    publicId: `public_${now}_${randomId}`,
    isLocal: true,
    source: "local",
  };
};

/**
 * Prepare local chat for migration to Convex
 * Removes local-only fields that shouldn't be stored in database
 */
export const prepareForMigration = (
  chat: LocalChat,
): Omit<LocalChat, "_id" | "isLocal" | "source"> => {
  const {
    _id: _localId,
    isLocal: _isLocal,
    source: _source,
    ...convexCompatible
  } = chat;
  return convexCompatible;
};

/**
 * Chat API response types
 */
export interface ShareChatResponse {
  shareId?: string;
  publicId?: string;
  url?: string;
}

/**
 * Migration mapping for tracking local to server ID changes
 */
export interface ChatMigrationMapping {
  localId: string;
  serverId: Id<"chats">;
}

/**
 * Type guard to validate if an object is a valid Chat
 * Checks for all required properties based on the Chat union type
 */
export function isValidChat(obj: unknown): obj is Chat {
  if (!obj || typeof obj !== "object") return false;

  const chat = obj as Record<string, unknown>;

  // Check common required fields
  if (typeof chat._id !== "string") return false;
  if (typeof chat.title !== "string") return false;
  if (typeof chat.createdAt !== "number") return false;
  if (typeof chat.updatedAt !== "number") return false;

  // Check privacy field
  const validPrivacy = ["private", "shared", "public"];
  if (!chat.privacy || !validPrivacy.includes(chat.privacy as string))
    return false;

  // Check if it's a LocalChat
  if ("isLocal" in chat && chat.isLocal === true) {
    return chat.source === "local";
  }

  // Check if it's a server chat (Doc<"chats">)
  if ("_creationTime" in chat) {
    return typeof chat._creationTime === "number";
  }

  // If it has neither isLocal nor _creationTime, it's not a valid Chat
  return false;
}

/**
 * Safe conversion to Chat type with validation
 * Returns null if the object is not a valid Chat
 */
export function toChat(obj: unknown): Chat | null {
  if (isValidChat(obj)) {
    return obj;
  }
  return null;
}

/**
 * Create a Chat object from partial data with defaults
 * Used for safe conversion from unified format
 */
export function createChatFromData(
  data: {
    _id?: string;
    id?: string;
    title?: string;
    createdAt?: number;
    updatedAt?: number;
    privacy?: string;
    shareId?: string;
    publicId?: string;
    userId?: string;
    _creationTime?: number;
  },
  isAuthenticated: boolean,
): Chat {
  const id = data._id || data.id || "";
  const now = Date.now();

  if (isAuthenticated && data._creationTime) {
    // Server chat (Doc<"chats">)
    return {
      _id: id as Id<"chats">,
      _creationTime: data._creationTime,
      title: data.title || "Untitled Chat",
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      privacy: (data.privacy as "private" | "shared" | "public") || "private",
      shareId: data.shareId,
      publicId: data.publicId,
      userId: data.userId as Id<"users"> | undefined,
    } as Doc<"chats">;
  } else {
    // Local chat
    return {
      _id: id,
      title: data.title || "Untitled Chat",
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      privacy: (data.privacy as "private" | "shared" | "public") || "private",
      shareId: data.shareId,
      publicId: data.publicId,
      isLocal: true,
      source: "local",
    };
  }
}
