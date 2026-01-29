/**
 * Server-Sent Events (SSE) stream parsing utilities.
 * Provides shared parsing for SSE streams used by chat repositories.
 *
 * @see ConvexChatRepository.generateResponse - Authenticated streaming
 */

import { getErrorMessage } from "@/lib/utils/errorUtils";

/** SSE protocol constants */
export const SSE_DATA_PREFIX = "data: ";
export const SSE_DONE_SIGNAL = "[DONE]";
const SSE_LINE_REGEX = /\r?\n/;

/** Generic SSE event structure */
export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

/** Parse error event for when JSON parsing fails */
export interface SSEParseError {
  type: "parse_error";
  raw: string;
  error: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Parse an SSE stream and yield each event.
 * Handles buffer management, line splitting, and JSON parsing.
 *
 * @param response - Fetch Response with streaming body
 * @yields SSEEvent objects parsed from the stream, or SSEParseError on JSON failures
 * @throws Error if response.body is missing
 *
 * @example
 * ```typescript
 * for await (const event of parseSSEStream(response)) {
 *   if (event.type === "parse_error") {
 *     console.error("Parse failed:", event.error);
 *     continue;
 *   }
 *   if (event.type === "content") handleContent(event);
 * }
 * ```
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<SSEEvent | SSEParseError> {
  if (!response.body) {
    throw new Error("SSE response body is missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(SSE_LINE_REGEX);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith(SSE_DATA_PREFIX)) continue;
        const data = line.slice(SSE_DATA_PREFIX.length);
        if (!data || data === SSE_DONE_SIGNAL) continue;

        try {
          const parsed: unknown = JSON.parse(data);
          if (isRecord(parsed) && typeof parsed.type === "string") {
            const { type, ...rest } = parsed;
            yield { type, ...rest };
          } else {
            yield {
              type: "parse_error",
              raw: data,
              error: "Invalid SSE event shape",
            } satisfies SSEParseError;
          }
        } catch (parseError) {
          yield {
            type: "parse_error",
            raw: data,
            error: getErrorMessage(parseError),
          } satisfies SSEParseError;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Check if an SSE event is a parse error.
 * Type guard for narrowing SSEEvent | SSEParseError.
 */
export function isSSEParseError(event: SSEEvent | SSEParseError): event is SSEParseError {
  return event.type === "parse_error";
}

/**
 * Process SSE stream with callback pattern.
 * Wrapper around parseSSEStream for callback-style consumers.
 *
 * @param response - Fetch Response with streaming body
 * @param onEvent - Callback invoked for each parsed event
 * @param onDone - Optional callback invoked when stream completes
 */
export async function processSSEStream(
  response: Response,
  onEvent: (event: SSEEvent | SSEParseError) => void,
  onDone?: () => void,
): Promise<void> {
  for await (const event of parseSSEStream(response)) {
    onEvent(event);
  }
  onDone?.();
}
