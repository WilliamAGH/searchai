"use node";
/**
 * SSE streaming utilities for AI generation
 * Handles OpenRouter API streaming and chunk processing
 */

interface OpenRouterMessage {
  role: string;
  content: string;
  cache_control?: { type: string };
}

interface OpenRouterBody {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_tokens: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  reasoning?: {
    max_tokens?: number; // Optional - can use either max_tokens OR effort
    effort?: "low" | "medium" | "high"; // Optional - can use either effort OR max_tokens
  };
}

// Re-export from shared utility
export { normalizeUrlForKey } from "../lib/url";

/**
 * Stream chunks from OpenRouter API
 * - Yields parsed SSE JSON payloads
 * - Handles [DONE] signal
 * - Detailed error logging
 * - Throws on HTTP/parsing errors
 * @param body - OpenRouter API request body
 * @yields Parsed JSON chunks from stream
 */
export async function* streamOpenRouter(
  body: OpenRouterBody,
  opts: { apiKey: string; siteUrl?: string; siteTitle?: string; debug?: boolean },
) {
  const { apiKey, siteUrl, siteTitle, debug } = opts;
  if (debug)
    console.info("🔄 OpenRouter streaming request initiated:", {
      model: body.model,
      messageCount: body.messages.length,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    });

  try {
    if (debug)
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
          ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
          ...(siteTitle ? { "X-Title": siteTitle } : {}),
        },
        body: JSON.stringify({ ...body, stream: true }),
      },
    );

    if (debug)
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
                if (debug) console.info("✅ OpenRouter stream completed");
                return;
              }
              try {
                const parsedData = JSON.parse(data);
                if (debug) console.info("📦 Final chunk from buffer:", parsedData);
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
              if (debug) console.info("✅ OpenRouter stream completed");
              return;
            }
            try {
              const parsedData = JSON.parse(data);
              if (debug && parsedData.choices?.[0]?.delta?.content) {
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
