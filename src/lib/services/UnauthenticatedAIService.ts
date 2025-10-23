/**
 * AI Service for unauthenticated users
 * Handles streaming responses via HTTP endpoints
 */
import { logger } from "../logger";
import type { MessageStreamChunk } from "../types/message";

/**
 * Service for invoking unauthenticated HTTP endpoints with streaming.
 *
 * Uses `/api/*` proxy paths in development and `VITE_CONVEX_URL`-prefixed
 * absolute URLs in production builds.
 */
export class UnauthenticatedAIService {
  private convexUrl: string;
  private abortController: AbortController | null = null;

  /**
   * Create a new unauthenticated AI service.
   * @param convexUrl - Base Convex URL (e.g. `https://<deployment>.convex.cloud`).
   */
  constructor(convexUrl: string) {
    if (!convexUrl) {
      logger.warn(
        "[UnauthenticatedAIService] Missing Convex URL - network calls may fail",
      );
    } else {
      try {
        // Validate URL format at construction time
        const _parsed = new URL(convexUrl);
        void _parsed;
      } catch {
        logger.warn(
          "[UnauthenticatedAIService] Invalid Convex URL format:",
          convexUrl,
        );
      }
    }
    this.convexUrl = convexUrl;
  }

  /**
   * Generate an AI response using STREAMING agent workflow.
   *
   * Consumes SSE stream from /api/ai/agent/stream endpoint.
   * Emits progress events for: planning, searching, scraping, analyzing, generating
   * Streams answer content token-by-token for real-time UX.
   */
  async generateResponse(
    message: string,
    chatId: string,
    onChunk?: (chunk: MessageStreamChunk) => void,
    _searchResults?: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore: number;
    }>,
    _sources?: string[],
    chatHistory?: Array<{ role: "user" | "assistant"; content: string }>,
    onComplete?: () => void,
  ): Promise<void> {
    this.abortController = new AbortController();

    try {
      const host = window.location.hostname;
      const isDev = host === "localhost" || host === "127.0.0.1";
      const apiUrl = isDev
        ? "/api/ai/agent/stream" // NEW: Streaming endpoint
        : `${this.convexUrl}/api/ai/agent/stream`;

      // Build optional conversationContext string from chatHistory
      const conversationContext = (chatHistory || [])
        .slice(-20)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")
        .slice(0, 4000);

      logger.info(
        "[UnauthenticatedAIService] Starting streaming request to:",
        apiUrl,
      );

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationContext }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `HTTP ${response.status} ${response.statusText} ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error("No response body received from streaming endpoint");
      }

      logger.info(
        "[UnauthenticatedAIService] Streaming response received, parsing SSE...",
      );

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const searchResults: Array<{
        title: string;
        url: string;
        snippet: string;
        relevanceScore: number;
      }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") {
            logger.info("[UnauthenticatedAIService] Stream complete");
            onComplete?.();
            return;
          }

          try {
            const event = JSON.parse(data);

            // Handle different event types from backend
            switch (event.type) {
              case "progress":
                // Emit searchProgress updates for all stages
                onChunk?.({
                  type: "progress",
                  stage: event.stage, // planning, searching, scraping, analyzing, generating
                  message: event.message,
                  urls: event.urls,
                  currentUrl: event.currentUrl,
                  queries: event.queries,
                  sourcesUsed: event.sourcesUsed,
                });
                logger.debug(
                  "[UnauthenticatedAIService] Progress:",
                  event.stage,
                  event.message,
                );
                break;

              case "reasoning":
                // Emit thinking/reasoning chunks
                onChunk?.({
                  type: "reasoning",
                  content: event.content,
                });
                logger.debug(
                  "[UnauthenticatedAIService] Reasoning chunk received",
                );
                break;

              case "content":
                // Emit answer content chunks
                const delta = event.delta || event.content || "";
                onChunk?.({
                  type: "content",
                  content: delta,
                  delta: delta,
                });
                break;

              case "tool_result":
                // Extract search results from tool outputs
                if (event.toolName === "search_web") {
                  try {
                    const toolOutput = JSON.parse(event.result);
                    const results = toolOutput.results || [];
                    searchResults.push(
                      ...results.map((r: unknown) => {
                        const result = r as Record<string, unknown>;
                        return {
                          title: String(result.title || ""),
                          url: String(result.url || ""),
                          snippet: String(result.snippet || ""),
                          relevanceScore: Number(result.relevanceScore) || 0.5,
                        };
                      }),
                    );
                    logger.debug(
                      "[UnauthenticatedAIService] Search results extracted:",
                      results.length,
                    );
                  } catch (parseError) {
                    logger.warn(
                      "[UnauthenticatedAIService] Failed to parse search results",
                      parseError,
                    );
                  }
                }
                break;

              case "complete":
                // Final metadata with workflow details
                const workflow = event.workflow || {};
                const research = workflow.research || {};
                const answer = workflow.answer || {};

                onChunk?.({
                  type: "metadata",
                  metadata: {
                    sources: answer.sourcesUsed || [],
                    searchResults:
                      searchResults.length > 0
                        ? searchResults
                        : (research.sourcesUsed || []).map((s: unknown) => {
                            const source = s as Record<string, unknown>;
                            return {
                              title: String(source.title || ""),
                              url: String(source.url || ""),
                              snippet: "",
                              relevanceScore:
                                source.relevance === "high"
                                  ? 0.9
                                  : source.relevance === "medium"
                                    ? 0.7
                                    : 0.5,
                            };
                          }),
                    workflowId: workflow.workflowId,
                  } as unknown,
                });
                logger.info(
                  "[UnauthenticatedAIService] Workflow complete:",
                  workflow.workflowId,
                );
                break;

              case "error":
                logger.error(
                  "[UnauthenticatedAIService] Stream error:",
                  event.error,
                );
                onChunk?.({
                  type: "error",
                  error: event.error,
                });
                break;

              default:
                logger.warn(
                  "[UnauthenticatedAIService] Unknown event type:",
                  event.type,
                );
            }
          } catch (parseError) {
            logger.warn(
              "[UnauthenticatedAIService] Failed to parse SSE event:",
              parseError,
            );
          }
        }
      }

      logger.info("[UnauthenticatedAIService] Stream ended normally");
      onComplete?.();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error as { name?: string }).name === "AbortError"
      ) {
        logger.info("[UnauthenticatedAIService] Stream aborted by user");
        // Swallow aborts
      } else {
        logger.error(
          "[UnauthenticatedAIService] Streaming request failed",
          error,
        );
        onChunk?.({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Abort any in-flight streaming request.
   */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Execute the web search endpoint with a natural language query.
   * @param query - Search query text.
   */
}
