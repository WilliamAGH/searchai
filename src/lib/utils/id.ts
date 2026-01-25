/**
 * Stable ID generation utilities
 * Avoids hydration mismatches by using deterministic IDs
 * Single source of truth for local ID generation (DRY)
 */

import { useId } from "react";

/** Prefixes for local IDs - single source of truth */
export const LOCAL_ID_PREFIXES = {
  chat: "local_",
  message: "msg_",
  share: "share_",
  public: "public_",
} as const;

export type LocalIdType = keyof typeof LOCAL_ID_PREFIXES;

/**
 * Core local ID generation logic - used by all local ID utilities.
 * @internal This is the single source of truth for the local ID format.
 */
function generateLocalIdCore(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a local ID for temporary entities (chats, messages).
 * This is the canonical function for generating local IDs.
 *
 * @param type - Type of local ID to generate ("chat", "message", "share", "public")
 * @returns Local ID string in format: `{prefix}_{timestamp}_{random}`
 *
 * @example
 * const chatId = generateLocalId("chat"); // "local_1732543200000_abc123def"
 * const msgId = generateLocalId("message"); // "msg_1732543200000_xyz789ghi"
 */
export function generateLocalId(type: LocalIdType): string {
  return generateLocalIdCore(LOCAL_ID_PREFIXES[type]);
}

/**
 * Generate a stable ID for component use (SSR-safe)
 * Uses React's built-in useId() which is designed for SSR hydration
 *
 * @example
 * function MyComponent() {
 *   const id = useStableId("input");
 *   return <input id={id} />;
 * }
 */
export function useStableId(prefix: string = "id"): string {
  const reactId = useId();
  return `${prefix}_${reactId}`;
}
