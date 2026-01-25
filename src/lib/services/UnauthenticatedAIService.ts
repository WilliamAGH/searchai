/**
 * @deprecated Removed. Streaming now uses direct fetch to /api/ai/agent/stream.
 * This stub remains temporarily to avoid import churn. Safe to delete once
 * no external tooling references it.
 *
 * Removal plan:
 * - Verify no imports in repo (grep UnauthenticatedAIService) → none
 * - Delete this file in next cleanup PR
 */
// Removed: UnauthenticatedAIService (streaming now uses direct fetch in repositories)
// This file is kept temporarily to avoid import churn; will be deleted after confirming no references remain.
import { logger } from "../logger";
import { buildHttpError, readResponseBody } from "../utils/httpUtils";
import { getErrorMessage } from "../utils/errorUtils";
import { parseSSEStream, isSSEParseError } from "../utils/sseParser";
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
      } catch (error) {
        logger.warn("[UnauthenticatedAIService] Invalid Convex URL format:", {
          convexUrl,
          error,
        });
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
   *
   * @see {@link ../utils/sseParser.ts} - Shared SSE parsing logic
   * @see {@link ConvexChatRepository.generateResponse} - Authenticated equivalent
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
        ? "/api/ai/agent/stream"
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
        const errorText = await readResponseBody(response);
        throw buildHttpError(
          response,
          errorText,
          "[UnauthenticatedAIService] Streaming request failed",
        );
      }

      if (!response.body) {
        throw new Error("No response body received from streaming endpoint");
      }

      logger.info(
        "[UnauthenticatedAIService] Streaming response received, parsing SSE...",
      );

      // Track search results across events
      const searchResults: Array<{
        title: string;
        url: string;
        snippet: string;
        relevanceScore: number;
      }> = [];

      // Use shared SSE parser for stream processing
      for await (const evt of parseSSEStream(response)) {
        // Handle parse errors from the SSE parser
        if (isSSEParseError(evt)) {
          logger.warn("[UnauthenticatedAIService] Failed to parse SSE event", {
            error: evt.error,
            raw: evt.raw,
          });
          onChunk?.({
            type: "error",
            error: `Failed to parse SSE event: ${evt.error}`,
          });
          continue;
        }

        // Handle different event types from backend
        switch (evt.type) {
          case "progress":
            // Emit searchProgress updates for all stages
            onChunk?.({
              type: "progress",
              stage: evt.stage as string,
              message: evt.message as string,
              urls: evt.urls as string[] | undefined,
              currentUrl: evt.currentUrl as string | undefined,
              queries: evt.queries as string[] | undefined,
              sourcesUsed: evt.sourcesUsed as number | undefined,
            });
            logger.debug(
              "[UnauthenticatedAIService] Progress:",
              evt.stage,
              evt.message,
            );
            break;

          case "reasoning":
            // Emit thinking/reasoning chunks
            onChunk?.({
              type: "reasoning",
              content: evt.content as string,
            });
            logger.debug("[UnauthenticatedAIService] Reasoning chunk received");
            break;

          case "content": {
            // Emit answer content chunks
            const delta = (evt.delta || evt.content || "") as string;
            onChunk?.({
              type: "content",
              content: delta,
              delta: delta,
            });
            break;
          }

          case "tool_result":
            // Extract search results from tool outputs
            if (evt.toolName === "search_web") {
              try {
                const toolOutput = JSON.parse(evt.result as string);
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
                const errorMsg = getErrorMessage(parseError);
                logger.warn(
                  "[UnauthenticatedAIService] Failed to parse search results",
                  {
                    error: errorMsg,
                    result: evt.result,
                  },
                );
                onChunk?.({
                  type: "error",
                  error: `Failed to parse search results: ${errorMsg}`,
                });
              }
            }
            break;

          case "complete": {
            // Final metadata with workflow details
            const workflow = (evt.workflow || {}) as Record<string, unknown>;
            const research = (workflow.research || {}) as Record<
              string,
              unknown
            >;
            const answer = (workflow.answer || {}) as Record<string, unknown>;

            onChunk?.({
              type: "metadata",
              metadata: {
                sources: (answer.sourcesUsed || []) as string[],
                searchResults:
                  searchResults.length > 0
                    ? searchResults
                    : ((research.sourcesUsed || []) as unknown[]).map(
                        (s: unknown) => {
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
                        },
                      ),
                workflowId: workflow.workflowId as string | undefined,
              } as unknown,
            });
            logger.info(
              "[UnauthenticatedAIService] Workflow complete:",
              workflow.workflowId,
            );
            break;
          }

          case "error":
            logger.error("[UnauthenticatedAIService] Stream error:", evt.error);
            onChunk?.({
              type: "error",
              error: evt.error as string,
            });
            break;

          default:
            logger.warn(
              "[UnauthenticatedAIService] Unknown event type:",
              evt.type,
            );
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
        logger.error("[UnauthenticatedAIService] Streaming request failed", {
          error: getErrorMessage(error),
        });
        onChunk?.({
          type: "error",
          error: getErrorMessage(error),
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
