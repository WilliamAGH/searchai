/**
 * Shared message normalization utilities.
 *
 * These helpers keep read-time projections and write-time migrations aligned
 * to a single canonical message shape.
 */

interface TimestampLike {
  _creationTime: number;
  timestamp?: number;
}

/** Resolve a stable message timestamp. */
export function resolveMessageTimestamp(message: TimestampLike): number {
  if (
    typeof message.timestamp === "number" &&
    Number.isFinite(message.timestamp)
  ) {
    return message.timestamp;
  }
  return message._creationTime;
}

/** Normalize legacy reasoning payloads to a display-safe string. */
export function normalizeReasoningValue(
  reasoning: unknown,
): string | undefined {
  if (typeof reasoning === "string") {
    return reasoning;
  }
  if (reasoning === undefined || reasoning === null) {
    return undefined;
  }
  if (
    typeof reasoning === "number" ||
    typeof reasoning === "boolean" ||
    typeof reasoning === "bigint"
  ) {
    return String(reasoning);
  }

  try {
    return JSON.stringify(reasoning);
  } catch (error) {
    console.error("[normalizeReasoningValue] Failed to serialize reasoning", {
      type: typeof reasoning,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
