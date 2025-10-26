import type { Message } from "../../lib/types/message";

/**
 * Tracks generated fallback keys to ensure stability across renders.
 */
const fallbackKeyMap = new WeakMap<Message, string>();

/**
 * Module-level counter to guarantee uniqueness even when timestamps collide.
 */
let fallbackKeyCounter = 0;

function createFallbackKey(message: Message, seed?: string): string {
  const existing = fallbackKeyMap.get(message);
  if (existing) return existing;

  fallbackKeyCounter += 1;

  const timestamp =
    message.timestamp ??
    ("_creationTime" in message
      ? ((message as { _creationTime?: number })._creationTime ?? 0)
      : 0);

  const role = message.role ?? "unknown";
  const seedSuffix = seed ? `-${seed}` : "";
  const key = `fallback-${role}-${timestamp}-${fallbackKeyCounter}${seedSuffix}`;

  fallbackKeyMap.set(message, key);
  return key;
}

/**
 * Resolve a stable key for a message, falling back to a unique generator when
 * Convex/local identifiers are not available.
 */
export function resolveMessageKey(message: Message, seed?: string): string {
  if (typeof message._id === "string" && message._id.length > 0) {
    return message._id;
  }

  const candidateId = (message as { id?: string }).id;
  if (typeof candidateId === "string" && candidateId.length > 0) {
    return candidateId;
  }

  return createFallbackKey(message, seed);
}
