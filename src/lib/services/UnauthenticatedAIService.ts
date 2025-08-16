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
   * Generate a streamed AI response via SSE.
   * @param message - User message to send to the AI.
   * @param chatId - The current chat identifier.
   * @param onChunk - Optional handler for streamed message chunks.
   * @param searchResults - Optional normalized search results to include.
   * @param sources - Optional list of source URLs.
   * @param chatHistory - Optional prior messages for context.
   * @param onComplete - Optional callback invoked when the stream completes.
   */
  async generateResponse(
    message: string,
    chatId: string,
    onChunk?: (chunk: MessageStreamChunk) => void,
    searchResults?: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore: number;
    }>,
    sources?: string[],
    chatHistory?: Array<{ role: "user" | "assistant"; content: string }>,
    onComplete?: () => void,
  ): Promise<void> {
    // Create new abort controller for this request
    this.abortController = new AbortController();

    logger.info("[UnauthenticatedAIService] Starting generateResponse", {
      message: message.substring(0, 50),
      chatId,
      hasOnChunk: !!onChunk,
      hasOnComplete: !!onComplete,
    });

    try {
      // In development, use the proxied path directly
      // In production, use the full Convex URL
      const host = window.location.hostname;
      const isDev = host === "localhost" || host === "127.0.0.1";
      const apiUrl = isDev ? "/api/ai" : `${this.convexUrl}/api/ai`;

      logger.debug("[UnauthenticatedAIService] API URL", { apiUrl, isDev });

      const requestBody = {
        message,
        systemPrompt:
          "You are SearchAI, a knowledgeable and confident search assistant. You provide accurate, comprehensive answers based on search results and available information. You speak with authority when the information is clear, and transparently acknowledge limitations only when truly uncertain. Your goal is to be maximally helpful while maintaining accuracy.",
        searchResults: searchResults || [],
        sources: sources || [],
        chatHistory: chatHistory || [],
      };

      logger.debug("[UnauthenticatedAIService] Sending request", {
        bodySize: JSON.stringify(requestBody).length,
      });

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      });

      logger.info("[UnauthenticatedAIService] Response received", {
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "No error text");
        logger.error("[UnauthenticatedAIService] HTTP error", {
          status: response.status,
          errorText,
        });
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let chunksReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Stream completed successfully - notify completion
          logger.info("[UnauthenticatedAIService] Stream completed", {
            chunksReceived,
          });
          onComplete?.();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        // Parse SSE format (data: {...})
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              // Best-effort runtime guard
              if (data && typeof data === "object" && "type" in data) {
                chunksReceived++;
                onChunk?.(data as MessageStreamChunk);
              }
            } catch {
              // Skip unparseable lines including "data: [DONE]"
              if (line !== "data: [DONE]") {
                logger.debug("[UnauthenticatedAIService] Skipped line", {
                  line: line.substring(0, 100),
                });
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        (error as { name?: string }).name === "AbortError"
      ) {
        logger.info("[UnauthenticatedAIService] Request aborted");
      } else {
        logger.error("[UnauthenticatedAIService] Request failed", error);
        throw error;
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
  async searchWithAI(query: string): Promise<unknown> {
    // In development, use the proxied path directly
    // In production, use the full Convex URL
    const host = window.location.hostname;
    const isDev = host === "localhost" || host === "127.0.0.1";
    const apiUrl = isDev ? "/api/search" : `${this.convexUrl}/api/search`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    return response.json();
  }
}
