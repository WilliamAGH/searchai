import type { Message } from "@/lib/types/message";

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
    typeof message.timestamp === "number"
      ? message.timestamp
      : (message._creationTime ?? 0);

  const role = message.role ?? "unknown";
  const seedSuffix = seed ? `-${seed}` : "";
  const key = `fallback-${role}-${timestamp}-${fallbackKeyCounter}${seedSuffix}`;

  fallbackKeyMap.set(message, key);
  return key;
}

/**
 * Resolve a stable key for a message, falling back to a unique generator when
 * identifiers are not available.
 */
export function resolveMessageKey(message: Message, seed?: string): string {
  if (typeof message._id === "string" && message._id.length > 0) {
    return message._id;
  }

  return createFallbackKey(message, seed);
}
