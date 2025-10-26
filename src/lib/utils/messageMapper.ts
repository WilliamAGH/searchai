// Maps messages to local format for frontend display
// This is a frontend-only utility, not duplicating Convex types

import type { SearchResult } from "../types/message";

interface ContextReference {
  url?: string;
  title?: string;
  relevanceScore?: number;
  type?: "search_result" | "scraped_page";
}

interface UnifiedMessage {
  id?: string;
  _id?: string;
  chatId: string;
  role: string;
  content?: string;
  timestamp?: number;
  searchResults?: SearchResult[];
  sources?: string[];
  reasoning?: string;
  // Present on agent-persisted messages
  contextReferences?: ContextReference[];
}

export function mapMessagesToLocal(
  messages: UnifiedMessage[],
  _isAuthenticated: boolean,
) {
  return messages.map((msg) => {
    // Synthesize searchResults from contextReferences when not present (Agents workflow)
    let searchResults: SearchResult[] | undefined = msg.searchResults;
    if (!Array.isArray(searchResults) && Array.isArray(msg.contextReferences)) {
      try {
        const refs: ContextReference[] = msg.contextReferences;
        searchResults = refs
          .filter((r) => !!r && typeof r.url === "string")
          .slice(0, 10)
          .map((r) => {
            let title = r.title || "Source";
            if ((!title || title === "Source") && r.url) {
              try {
                title = new URL(r.url).hostname;
              } catch {
                title = r.url;
              }
            }
            return {
              title,
              url: r.url || "",
              snippet: "",
              relevanceScore:
                typeof r.relevanceScore === "number" ? r.relevanceScore : 0.5,
              kind: r.type,
            } as SearchResult;
          });
      } catch {
        // ignore mapping errors
      }
    }

    return {
      _id: msg.id || msg._id,
      chatId: msg.chatId,
      role: msg.role,
      content: msg.content || "",
      timestamp: msg.timestamp || Date.now(),
      isLocal: !_isAuthenticated,
      searchResults,
      sources: Array.isArray(msg.sources) ? msg.sources : undefined,
      reasoning: msg.reasoning,
    };
  });
}
