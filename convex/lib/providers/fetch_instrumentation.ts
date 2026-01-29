"use node";

import { generateMessageId } from "../id_generator";

/**
 * Type guards for request payload inspection
 */
type FunctionCallOutputItem = Record<string, unknown> & {
  type: "function_call_output";
  id?: string;
};

type InstrumentedRequestPayload = Record<string, unknown> & {
  input: unknown[];
};

const isFunctionCallOutputItem = (value: unknown): value is FunctionCallOutputItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.type === "string" && candidate.type === "function_call_output";
};

const isInstrumentedRequestPayload = (value: unknown): value is InstrumentedRequestPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.input);
};

/**
 * Wrap the native fetch to inject IDs for function_call_output items
 * and optionally dump payloads when debugging
 */
const SENSITIVE_HEADER_PATTERN = /^(authorization|x[-_]api[-_]key|api[-_]key)$/i;

export const redactSensitiveHeaders = (
  headers: HeadersInit | undefined | null,
): Record<string, string> | undefined => {
  if (!headers) {
    return undefined;
  }

  const entries: Array<[string, string]> = (() => {
    if (headers instanceof Headers) {
      return Array.from(headers.entries());
    }
    if (Array.isArray(headers)) {
      // Only process inner arrays with at least 2 elements; skip or warn on malformed entries
      return headers
        .filter((arr) => Array.isArray(arr) && arr.length >= 2)
        .map(([key, value]) => [key, String(value)]);
    }
    return Object.entries(headers).map(([key, value]) => [key, String(value)]);
  })();

  const redacted: Record<string, string> = {};
  for (const [key, value] of entries) {
    redacted[key] = SENSITIVE_HEADER_PATTERN.test(key) ? "REDACTED" : value;
  }
  return redacted;
};

export const createInstrumentedFetch = (debugLogging: boolean): typeof fetch => {
  const instrumented = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const clonedInit: RequestInit = init ? { ...init } : {};
    let bodyText: string | undefined;
    let parsedBody: unknown;

    if (clonedInit.body && typeof clonedInit.body === "string") {
      bodyText = clonedInit.body;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch (error) {
        if (debugLogging) {
          console.error("[llm-debug] Failed to parse request body", error);
        }
      }
    }

    // Inject IDs for function_call_output items (required by Responses API)
    if (isInstrumentedRequestPayload(parsedBody)) {
      let mutated = false;
      for (const item of parsedBody.input) {
        if (!isFunctionCallOutputItem(item)) {
          continue;
        }
        if (typeof item.id !== "string" || item.id.length === 0) {
          item.id = generateMessageId();
          mutated = true;
        }
      }
      if (mutated) {
        if (debugLogging) {
          console.error("[llm-debug] Added IDs to function_call_output items");
        }
        bodyText = JSON.stringify(parsedBody);
        clonedInit.body = bodyText;
      }
    }

    if (debugLogging) {
      try {
        if (!bodyText && clonedInit.body) {
          bodyText =
            typeof clonedInit.body === "string"
              ? clonedInit.body
              : await new Response(clonedInit.body).text();
        }
        console.error("[llm-debug] ========== OUTGOING REQUEST ==========");
        console.error("[llm-debug] URL:", input);
        console.error(
          "[llm-debug] Headers:",
          JSON.stringify(redactSensitiveHeaders(clonedInit.headers) ?? {}, null, 2),
        );
        console.error(
          "[llm-debug] Body:",
          bodyText ? JSON.stringify(JSON.parse(bodyText), null, 2) : "",
        );
        console.error("[llm-debug] =====================================");
      } catch (error) {
        console.error("[llm-debug] Failed to log request", error);
      }
    }

    const response = await fetch(input, clonedInit);

    if (debugLogging) {
      try {
        const responseClone = response.clone();
        const responseText = await responseClone.text();
        console.error("[llm-debug] ========== INCOMING RESPONSE ==========");
        console.error("[llm-debug] Status:", response.status, response.statusText);
        console.error(
          "[llm-debug] Headers:",
          JSON.stringify(
            redactSensitiveHeaders(Object.fromEntries(response.headers.entries())) ?? {},
            null,
            2,
          ),
        );
        console.error(
          "[llm-debug] Body:",
          responseText ? JSON.stringify(JSON.parse(responseText), null, 2) : "",
        );
        console.error("[llm-debug] ======================================");
      } catch (error) {
        console.error("[llm-debug] Failed to log response", error);
      }
    }

    return response;
  };

  return instrumented as typeof fetch;
};
