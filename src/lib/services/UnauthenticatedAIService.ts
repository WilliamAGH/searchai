/**
 * AI Service for unauthenticated users
 * Handles streaming responses via HTTP endpoints
 */

export class UnauthenticatedAIService {
  private convexUrl: string;
  private abortController: AbortController | null = null;

  constructor(convexUrl: string) {
    this.convexUrl = convexUrl;
  }

  async generateResponse(
    message: string,
    chatId: string,
    onChunk?: (chunk: any) => void,
  ): Promise<void> {
    // Create new abort controller for this request
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.convexUrl}/api/chat/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          chatId,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Parse and emit chunks
        try {
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const data = JSON.parse(line);
              onChunk?.(data);
            }
          }
        } catch (e) {
          // Handle partial chunks
          console.debug("Partial chunk received:", chunk);
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Request aborted");
      } else {
        throw error;
      }
    } finally {
      this.abortController = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async searchWithAI(query: string): Promise<any> {
    const response = await fetch(`${this.convexUrl}/api/search`, {
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
