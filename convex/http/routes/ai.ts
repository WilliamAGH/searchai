/**
 * AI generation route handlers
 * - OPTIONS and POST /api/ai endpoints
 * - SSE streaming for AI responses
 */

import { httpAction } from "../../_generated/server";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog } from "../utils";
import type { SearchResult } from "../../search/providers/index";
import { applyEnhancements } from "../../enhancements";
import { normalizeSearchResults } from "../../lib/security/sanitization";

/**
 * Register AI routes on the HTTP router
 */
export function registerAIRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/ai
  http.route({
    path: "/api/ai",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": requested || "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }),
  });

  // AI generation endpoint with SSE streaming
  http.route({
    path: "/api/ai",
    method: "POST",
    handler: httpAction(async (_ctx, request) => {
      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
        );
      }

      // Validate payload structure (must be a plain object, not array or null)
      if (
        !rawPayload ||
        typeof rawPayload !== "object" ||
        Array.isArray(rawPayload)
      ) {
        return corsResponse(
          JSON.stringify({ error: "Invalid request payload" }),
          400,
        );
      }
      const payload = rawPayload as Record<string, unknown>;

      // Validate and sanitize message (required field)
      if (!payload.message || typeof payload.message !== "string") {
        return corsResponse(
          JSON.stringify({ error: "Message must be a string" }),
          400,
        );
      }
      // Remove control characters and null bytes, then limit length
      const message = String(payload.message)
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, 10000);

      // Sanitize optional systemPrompt
      const systemPrompt = payload.systemPrompt
        ? String(payload.systemPrompt)
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
            .slice(0, 2000)
        : undefined;

      // Validate and sanitize sources array
      const sources = Array.isArray(payload.sources)
        ? payload.sources
            .slice(0, 20)
            .filter((s: unknown) => typeof s === "string")
            .map((s: unknown) =>
              String(s)
                // eslint-disable-next-line no-control-regex
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
                .slice(0, 2048),
            )
        : undefined;
      const chatHistory = Array.isArray(payload.chatHistory)
        ? payload.chatHistory.slice(0, 50).map((m: unknown) => {
            const msg = m as { role?: unknown; content?: unknown };
            return {
              role:
                msg.role === "user" || msg.role === "assistant"
                  ? msg.role
                  : ("assistant" as const),
              content: String(msg.content || "").slice(0, 10000),
            };
          })
        : undefined;

      // Normalize searchResults to ensure relevanceScore is always present
      const searchResults = payload.searchResults
        ? normalizeSearchResults(payload.searchResults)
        : [];

      if (!message.trim()) {
        return corsResponse(
          JSON.stringify({ error: "Message is required" }),
          400,
        );
      }

      dlog("🤖 AI ENDPOINT CALLED:");
      dlog("Message length:", typeof message === "string" ? message.length : 0);
      dlog("System Prompt length:", systemPrompt?.length || 0);
      dlog("Search Results count:", searchResults?.length || 0);
      dlog("Sources count:", sources?.length || 0);
      dlog("Chat History count:", chatHistory?.length || 0);
      dlog("Environment Variables Available:");
      dlog(
        "- OPENROUTER_API_KEY:",
        process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
      );
      dlog(
        "- CONVEX_OPENAI_API_KEY:",
        process.env.CONVEX_OPENAI_API_KEY ? "SET" : "NOT SET",
      );
      dlog(
        "- CONVEX_OPENAI_BASE_URL:",
        process.env.CONVEX_OPENAI_BASE_URL ? "SET" : "NOT SET",
      );

      // Apply universal enhancements to anonymous AI generation as well
      const enh = applyEnhancements(String(message || ""), {
        enhanceQuery: false,
        enhanceSearchTerms: false,
        injectSearchResults: false,
        enhanceContext: true,
        enhanceSystemPrompt: true,
        enhanceResponse: true, // Enable response transformations
      });
      const enhancedSystemPromptAddition = enh.enhancedSystemPrompt || "";
      const enhancedContextAddition = enh.enhancedContext || "";

      // Merge enhancement additions into provided system prompt
      let effectiveSystemPrompt = String(
        systemPrompt ||
          "You are SearchAI, a knowledgeable and confident search assistant. You provide accurate, comprehensive answers based on search results and available information. You speak with authority when the information is clear, and transparently acknowledge limitations only when truly uncertain. Your goal is to be maximally helpful while maintaining accuracy.",
      );
      if (enhancedSystemPromptAddition) {
        effectiveSystemPrompt += "\n\n" + enhancedSystemPromptAddition;
      }
      if (enhancedContextAddition) {
        // Encourage bracketed domain citations for anonymous as well
        effectiveSystemPrompt +=
          "\n\nUse the following additional context when relevant. When citing sources inline, use the domain name in brackets like [example.com] immediately after the relevant claim." +
          "\n\n" +
          enhancedContextAddition;
      }

      // Check if OpenRouter API key is available
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const CONVEX_OPENAI_API_KEY = process.env.CONVEX_OPENAI_API_KEY;
      const CONVEX_OPENAI_BASE_URL = process.env.CONVEX_OPENAI_BASE_URL;
      const SITE_URL = process.env.SITE_URL;
      const SITE_TITLE = process.env.SITE_TITLE;

      if (!OPENROUTER_API_KEY) {
        return handleNoOpenRouter(
          CONVEX_OPENAI_API_KEY,
          CONVEX_OPENAI_BASE_URL,
          effectiveSystemPrompt,
          message,
          searchResults || [],
          sources || [],
        );
      }

      try {
        return await handleOpenRouterStreaming(
          OPENROUTER_API_KEY,
          effectiveSystemPrompt,
          chatHistory || [],
          message,
          searchResults || [],
          sources || [],
          enh,
          SITE_URL,
          SITE_TITLE,
        );
      } catch (error) {
        console.error("💥 OPENROUTER FAILED with exception:", {
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });

        return handleOpenRouterFailure(
          error,
          CONVEX_OPENAI_API_KEY,
          CONVEX_OPENAI_BASE_URL,
          effectiveSystemPrompt,
          message,
          searchResults || [],
          sources || [],
        );
      }
    }),
  });
}

/**
 * Handle case when OpenRouter API key is not available
 */
async function handleNoOpenRouter(
  CONVEX_OPENAI_API_KEY: string | undefined,
  CONVEX_OPENAI_BASE_URL: string | undefined,
  effectiveSystemPrompt: string,
  message: string,
  searchResults: SearchResult[],
  sources: string[],
) {
  dlog("🤖 No OpenRouter API key, trying Convex OpenAI...");

  // Try Convex OpenAI fallback
  if (CONVEX_OPENAI_API_KEY && CONVEX_OPENAI_BASE_URL) {
    try {
      const convexOpenAIBody = {
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: effectiveSystemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      };

      dlog("🤖 CONVEX OPENAI REQUEST:");
      dlog("URL:", `${CONVEX_OPENAI_BASE_URL}/chat/completions`);
      dlog("Body (redacted):", {
        model: convexOpenAIBody.model,
        messagesCount: convexOpenAIBody.messages?.length ?? 0,
        sysPromptChars: convexOpenAIBody.messages?.[0]?.content?.length ?? 0,
        userMsgChars: convexOpenAIBody.messages?.[1]?.content?.length ?? 0,
        temperature: convexOpenAIBody.temperature,
        max_tokens: convexOpenAIBody.max_tokens,
      });

      const response = await fetch(
        `${CONVEX_OPENAI_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CONVEX_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(convexOpenAIBody),
        },
      );

      dlog("🤖 CONVEX OPENAI RESPONSE STATUS:", response.status);
      dlog(
        "🤖 CONVEX OPENAI RESPONSE HEADERS:",
        Object.fromEntries(response.headers.entries()),
      );

      if (response.ok) {
        const data = await response.json();
        dlog("🤖 CONVEX OPENAI RESPONSE BODY:", JSON.stringify(data, null, 2));

        const responseContent =
          data.choices[0].message.content ||
          "I apologize, but I couldn't generate a response.";

        const successResponse = {
          response: responseContent,
          searchResults,
          sources,
        };

        dlog(
          "🤖 CONVEX OPENAI SUCCESS RESPONSE:",
          JSON.stringify(successResponse, null, 2),
        );

        return corsResponse(JSON.stringify(successResponse));
      } else {
        const errorText = await response.text();
        console.error("🤖 CONVEX OPENAI ERROR RESPONSE:", errorText);
        throw new Error(
          `Convex OpenAI failed: ${response.status} - ${errorText}`,
        );
      }
    } catch (convexError) {
      console.error("🤖 CONVEX OPENAI EXCEPTION:", convexError);
      console.error(
        "Convex OpenAI Error stack:",
        convexError instanceof Error ? convexError.stack : "No stack trace",
      );
    }
  }

  // Final fallback - create response from search results
  const fallbackResponse =
    searchResults && searchResults.length > 0
      ? `Based on the search results I found:\n\n${searchResults
          .map(
            (r: SearchResult) =>
              `**${r.title}**\n${r.snippet}\nSource: ${r.url}`,
          )
          .join("\n\n")
          .substring(
            0,
            1500,
          )}...\n\n*Note: AI processing is currently unavailable, but the above search results should help answer your question.*`
      : `I'm unable to process your question with AI right now due to missing API configuration. However, I can suggest searching for "${message}" on:\n\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})\n- [Wikipedia](https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(message)})`;

  const fallbackResponseObj = {
    response: fallbackResponse,
    searchResults,
    sources,
    error: "No AI API keys configured",
  };

  dlog(
    "🤖 AI FALLBACK RESPONSE:",
    JSON.stringify(fallbackResponseObj, null, 2),
  );

  return corsResponse(JSON.stringify(fallbackResponseObj));
}

/**
 * Format search results with scraped content for AI context
 */
function formatSearchResultsForContext(searchResults: SearchResult[]): string {
  if (!searchResults || searchResults.length === 0) {
    return "";
  }

  const formattedResults = searchResults
    .map((result, index) => {
      let resultStr = `[${index + 1}] ${result.fullTitle || result.title}\n`;
      resultStr += `URL: ${result.url}\n`;

      // Include scraped content if available
      if (result.content) {
        // Limit content to prevent context overflow
        const maxContentLength = 1000;
        const truncatedContent =
          result.content.length > maxContentLength
            ? result.content.slice(0, maxContentLength) + "..."
            : result.content;
        resultStr += `Content: ${truncatedContent}\n`;
      } else if (result.summary) {
        resultStr += `Summary: ${result.summary}\n`;
      } else {
        resultStr += `Snippet: ${result.snippet}\n`;
      }

      return resultStr;
    })
    .join("\n---\n\n");

  return `\n\nSearch Results with Content:\n${formattedResults}`;
}

/**
 * Handle OpenRouter streaming response
 */
async function handleOpenRouterStreaming(
  OPENROUTER_API_KEY: string,
  effectiveSystemPrompt: string,
  chatHistory: any[],
  message: string,
  searchResults: SearchResult[],
  sources: string[],
  enh: any,
  SITE_URL: string | undefined,
  SITE_TITLE: string | undefined,
) {
  dlog("🔄 Attempting OpenRouter API call with streaming...");

  // Build message history including system prompt and chat history
  // Include search results with scraped content in the user message
  const searchContext = formatSearchResultsForContext(searchResults);
  const enhancedMessage = searchContext
    ? `${message}${searchContext}`
    : message;

  const messages = [
    {
      role: "system",
      content: `${effectiveSystemPrompt}\n\nIMPORTANT: When citing sources inline, use the domain name in brackets like [example.com] immediately after the relevant claim.\n\nAlways respond using GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language. Avoid arbitrary HTML beyond <u>.\n\nBe direct, comprehensive, and authoritative in your responses. Focus on providing value and actionable information rather than hedging or expressing uncertainty unless truly warranted.`,
    },
    ...(chatHistory || []),
    { role: "user", content: enhancedMessage },
  ];

  const openRouterBody = {
    model: "google/gemini-2.5-flash",
    messages,
    temperature: 0.8, // Increased for more creative/verbose responses
    max_tokens: 6000, // Increased from 4000 for longer responses
    stream: true,
    // Enable caching for repeated context
    top_p: 0.95, // Slightly wider nucleus sampling
    frequency_penalty: -0.2, // Negative value encourages elaboration
    presence_penalty: 0.1, // Keep focused on topic
    // For thinking models, control reasoning verbosity
    // NOTE: OpenRouter only accepts ONE of effort or max_tokens, not both
    reasoning: {
      effort: "high" as const, // Use high effort for detailed thinking
    },
  };

  dlog("🤖 OPENROUTER REQUEST:");
  dlog("URL:", "https://openrouter.ai/api/v1/chat/completions");
  dlog("Body (redacted):", {
    model: openRouterBody.model,
    messagesCount: openRouterBody.messages?.length ?? 0,
    sysPromptChars: openRouterBody.messages?.[0]?.content?.length ?? 0,
    temperature: openRouterBody.temperature,
    max_tokens: openRouterBody.max_tokens,
    stream: openRouterBody.stream,
  });

  // Add timeout for the fetch request (90s)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        ...(SITE_URL ? { "HTTP-Referer": SITE_URL } : {}),
        ...(SITE_TITLE ? { "X-Title": SITE_TITLE } : {}),
      },
      body: JSON.stringify(openRouterBody),
      signal: controller.signal,
    },
  );

  clearTimeout(timeoutId);

  dlog("📊 OpenRouter Response Status:", response.status);
  dlog(
    "📊 OpenRouter Response Headers:",
    Object.fromEntries(response.headers.entries()),
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ OpenRouter API Error:", {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(
      `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  if (response.body) {
    dlog("✅ OpenRouter streaming response started");
    return createStreamingResponse(response.body, searchResults, sources, enh);
  } else {
    throw new Error("No response body received from OpenRouter");
  }
}

/**
 * Create SSE streaming response
 */
function createStreamingResponse(
  responseBody: ReadableStream<Uint8Array>,
  searchResults: SearchResult[],
  sources: string[],
  enh: any,
) {
  const stream = new ReadableStream({
    async start(controller) {
      const reader = responseBody.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let chunkCount = 0;
      let lastChunkTime = Date.now();
      let isStreamActive = true;

      // Periodic keepalive pings and adaptive timeout for streaming
      const pingIntervalMs = 15000;
      const pingIntervalId = setInterval(() => {
        if (!isStreamActive) {
          clearInterval(pingIntervalId);
          return;
        }
        // SSE comment line; ignored by client parser but keeps connections alive
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          // Controller might be closed, stop pinging
          clearInterval(pingIntervalId);
        }
      }, pingIntervalMs);

      let streamTimeoutId = setTimeout(() => {
        if (!isStreamActive) return;
        console.error("⏰ OpenRouter stream timeout after 120 seconds");
        isStreamActive = false;
        try {
          controller.error(
            new Error("OpenRouter stream timeout after 120 seconds"),
          );
        } catch {
          // Controller might already be closed
        }
      }, 120000);

      // Cleanup function
      const cleanup = () => {
        isStreamActive = false;
        clearTimeout(streamTimeoutId);
        clearInterval(pingIntervalId);
        try {
          reader.releaseLock();
        } catch {
          // Reader might already be released
        }
      };

      let fullResponse = "";
      try {
        while (isStreamActive) {
          const { done, value } = await reader.read();
          if (done) {
            console.info("🔄 OpenRouter streaming completed:", {
              totalChunks: chunkCount,
              duration: Date.now() - lastChunkTime,
            });
            break;
          }

          lastChunkTime = Date.now();
          // Refresh timeout upon activity
          clearTimeout(streamTimeoutId);
          streamTimeoutId = setTimeout(() => {
            if (!isStreamActive) return;
            console.error("⏰ OpenRouter stream timeout after 120 seconds");
            isStreamActive = false;
            try {
              controller.error(
                new Error("OpenRouter stream timeout after 120 seconds"),
              );
            } catch {
              // Controller might already be closed
            }
          }, 120000);

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                dlog("✅ OpenRouter streaming finished with [DONE]");
                isStreamActive = false;
                controller.close();
                cleanup();
                return;
              }
              try {
                chunkCount++;
                const chunk = JSON.parse(data);
                const chunkContent = chunk.choices?.[0]?.delta?.content || "";
                fullResponse += chunkContent;
                const streamData = {
                  type: "chunk",
                  content: chunkContent,
                  // Pass through thinking data from the chunk if available
                  thinking: chunk.choices?.[0]?.delta?.thinking || undefined,
                  reasoning: chunk.choices?.[0]?.delta?.reasoning || "",
                  searchResults,
                  sources,
                  provider: "openrouter",
                  model: "google/gemini-2.5-flash",
                  chunkNumber: chunkCount,
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`),
                );
              } catch (e) {
                console.error("❌ Failed to parse stream chunk:", {
                  error:
                    e instanceof Error ? e.message : "Unknown parsing error",
                  chunkChars: data?.length ?? 0,
                  chunkNumber: chunkCount,
                });
              }
            }
          }
        }
        // Apply response transformations after streaming completes
        if (
          fullResponse &&
          enh.responseTransformers &&
          enh.responseTransformers.length > 0
        ) {
          let transformedResponse = fullResponse;
          for (const transform of enh.responseTransformers) {
            try {
              transformedResponse = transform(transformedResponse);
            } catch {}
          }
          // Send transformation as a final update if content changed
          if (transformedResponse !== fullResponse) {
            const transformData = {
              type: "transformation",
              content: transformedResponse.slice(fullResponse.length),
              searchResults,
              sources,
              provider: "openrouter",
              model: "google/gemini-2.5-flash",
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(transformData)}\n\n`),
            );
          }
        }
        // Normal completion
        controller.close();
      } catch (error) {
        console.error("💥 Stream reading error:", {
          error:
            error instanceof Error ? error.message : "Unknown streaming error",
          timestamp: new Date().toISOString(),
        });
        try {
          controller.error(error);
        } catch {
          // Controller might already be closed
        }
      } finally {
        cleanup();
      }
    },
  });

  return new Response(stream, {
    headers: {
      // Harden SSE headers to avoid buffering by proxies and ensure UTF-8
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering on common reverse proxies (harmless elsewhere)
      "X-Accel-Buffering": "no",
      // CORS: endpoints are proxied locally during dev
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

/**
 * Handle OpenRouter failure with fallback
 */
async function handleOpenRouterFailure(
  error: unknown,
  CONVEX_OPENAI_API_KEY: string | undefined,
  CONVEX_OPENAI_BASE_URL: string | undefined,
  effectiveSystemPrompt: string,
  message: string,
  searchResults: SearchResult[],
  sources: string[],
) {
  // Try Convex OpenAI as backup
  if (CONVEX_OPENAI_API_KEY && CONVEX_OPENAI_BASE_URL) {
    try {
      dlog("🤖 Trying Convex OpenAI fallback...");
      const convexOpenAIBody = {
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: effectiveSystemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      };

      dlog("🤖 CONVEX OPENAI FALLBACK REQUEST:");
      dlog("URL:", `${CONVEX_OPENAI_BASE_URL}/chat/completions`);
      dlog("Body (redacted):", {
        model: convexOpenAIBody.model,
        messagesCount: convexOpenAIBody.messages?.length ?? 0,
        sysPromptChars: convexOpenAIBody.messages?.[0]?.content?.length ?? 0,
        userMsgChars: convexOpenAIBody.messages?.[1]?.content?.length ?? 0,
        temperature: convexOpenAIBody.temperature,
        max_tokens: convexOpenAIBody.max_tokens,
      });

      const fallbackResponse = await fetch(
        `${CONVEX_OPENAI_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CONVEX_OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(convexOpenAIBody),
        },
      );

      dlog(
        "🤖 CONVEX OPENAI FALLBACK RESPONSE STATUS:",
        fallbackResponse.status,
      );

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        dlog(
          "🤖 CONVEX OPENAI FALLBACK RESPONSE BODY:",
          JSON.stringify(fallbackData, null, 2),
        );

        const responseContent =
          fallbackData.choices[0].message.content ||
          "I apologize, but I couldn't generate a response.";

        const fallbackSuccessResponse = {
          response: responseContent,
          searchResults,
          sources,
        };

        dlog(
          "🤖 CONVEX OPENAI FALLBACK SUCCESS:",
          JSON.stringify(fallbackSuccessResponse, null, 2),
        );

        return corsResponse(JSON.stringify(fallbackSuccessResponse));
      } else {
        const fallbackErrorText = await fallbackResponse.text();
        console.error("🤖 CONVEX OPENAI FALLBACK ERROR:", fallbackErrorText);
      }
    } catch (convexError) {
      console.error("🤖 CONVEX OPENAI FALLBACK EXCEPTION:", convexError);
      console.error(
        "Convex OpenAI Fallback Error stack:",
        convexError instanceof Error ? convexError.stack : "No stack trace",
      );
    }
  }

  // Final fallback response with detailed error info
  const errorMessage = "AI processing failed";
  const fallbackResponse =
    searchResults && searchResults.length > 0
      ? `Based on the search results I found:\n\n${searchResults
          .map(
            (r: SearchResult) =>
              `**${r.title}**\n${r.snippet}\nSource: ${r.url}`,
          )
          .join("\n\n")
          .substring(
            0,
            1500,
          )}...\n\n*Note: AI processing is currently unavailable, but the above search results should help answer your question.*`
      : `I'm having trouble generating a response right now.\n\nPlease try again later, or search manually for "${message}" on:\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})`;

  const finalErrorResponse = {
    response: fallbackResponse,
    searchResults,
    sources,
    error: errorMessage,
    errorDetails: {
      timestamp: new Date().toISOString(),
    },
  };

  dlog(
    "🤖 AI FINAL ERROR RESPONSE:",
    JSON.stringify(finalErrorResponse, null, 2),
  );

  return corsResponse(JSON.stringify(finalErrorResponse));
}
