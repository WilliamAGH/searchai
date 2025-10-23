"use node";
/**
 * SSE streaming utilities for AI generation
 *
 * UPDATED: Now uses @openai/agents with shared provider library
 * - Modern Responses API (not deprecated Chat Completions)
 * - UUID v7 message IDs
 * - OpenRouter compatibility with provider routing
 * - Reasoning token support
 * - Maintains backward compatibility with existing code
 */

// Re-export from shared utility
export { normalizeUrlForKey } from "../lib/url";

// Legacy types for backward compatibility
export type OpenRouterMessage = {
  role: string; // Allow any string for flexibility
  content: string;
};

export type OpenRouterBody = {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

/**
 * Stream chunks from OpenRouter API (Legacy)
 *
 * LEGACY FUNCTION: This maintains backward compatibility with existing code.
 * For new implementations, consider using the shared OpenAI provider library
 * which supports both OpenRouter and OpenAI with unified configuration.
 *
 * Features:
 * - Yields parsed SSE JSON payloads
 * - Handles [DONE] signal
 * - Detailed error logging
 * - Throws on HTTP/parsing errors
 *
 * Environment variables:
 * - OPENROUTER_API_KEY (or LLM_API_KEY via shared library)
 * - DEBUG_OPENROUTER (for debug logging)
 * - SITE_URL (for HTTP-Referer header)
 * - SITE_TITLE (for X-Title header)
 *
 * @param body - OpenRouter API request body
 * @yields Parsed JSON chunks from stream
 */
export async function* streamOpenRouter(body: OpenRouterBody) {
  if (process.env.DEBUG_OPENROUTER)
    console.info("🔄 OpenRouter streaming request initiated:", {
      model: body.model,
      messageCount: body.messages.length,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    console.info("🔑 OpenRouter API Key check:", {
      hasKey: !!apiKey,
      keyLength: apiKey ? apiKey.length : 0,
      keyPrefix: apiKey ? apiKey.substring(0, 10) + "..." : "missing",
    });

    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY; cannot call OpenRouter.");
    }
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(process.env.SITE_URL
            ? { "HTTP-Referer": process.env.SITE_URL }
            : {}),
          ...(process.env.SITE_TITLE
            ? { "X-Title": process.env.SITE_TITLE }
            : {}),
        },
        body: JSON.stringify({ ...body, stream: true }),
      },
    );

    if (process.env.DEBUG_OPENROUTER)
      console.info("🌐 OpenRouter response status:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

    // Check response status
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`;
      console.error("❌ OpenRouter API request failed:", {
        status: response.status,
        statusText: response.statusText,
        errorDetails: errorText,
        requestBody: body,
      });
      throw new Error(errorMessage);
    }

    // Ensure we have a response body
    if (!response.body) {
      const errorMessage = "OpenRouter API returned no response body";
      console.error("❌ No response body received from OpenRouter");
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffer
          const lines = buffer.split(/\r?\n/);
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                if (process.env.DEBUG_OPENROUTER)
                  console.info("✅ OpenRouter stream completed");
                return;
              }
              try {
                const parsedData = JSON.parse(data);
                if (process.env.DEBUG_OPENROUTER)
                  console.info("📦 Final chunk from buffer:", parsedData);
                yield parsedData;
              } catch (parseError) {
                console.error(
                  "⚠️ Failed to parse final SSE data from buffer:",
                  {
                    data,
                    error:
                      parseError instanceof Error
                        ? parseError.message
                        : "Unknown error",
                  },
                );
              }
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ""; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              if (process.env.DEBUG_OPENROUTER)
                console.info("✅ OpenRouter stream completed");
              return;
            }
            try {
              const parsedData = JSON.parse(data);
              if (
                process.env.DEBUG_OPENROUTER &&
                parsedData.choices?.[0]?.delta?.content
              ) {
                console.info(
                  "📦 Chunk content:",
                  parsedData.choices[0].delta.content,
                );
              }
              yield parsedData;
            } catch (parseError) {
              console.error("⚠️ Failed to parse SSE data:", {
                data,
                error:
                  parseError instanceof Error
                    ? parseError.message
                    : "Unknown error",
              });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error("💥 OpenRouter streaming failed with exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
