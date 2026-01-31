/**
 * Message Mapper Utilities
 *
 * Transforms Convex messages to UI-ready format by:
 * - Synthesizing searchResults from contextReferences when not present
 * - Normalizing IDs to strings for React key usage
 * - Ensuring consistent field shapes for components
 */

import type {
  ContextReference,
  Message,
  SearchResult,
} from "@/lib/types/message";
import { logger } from "@/lib/logger";

const MAX_CONTEXT_REFERENCES = 10;

function synthesizeSearchResults(msg: Message): SearchResult[] | undefined {
  if (Array.isArray(msg.searchResults)) return msg.searchResults;
  if (!Array.isArray(msg.contextReferences)) return undefined;

  try {
    const refs: ContextReference[] = msg.contextReferences;
    return refs
      .filter((r) => !!r && typeof r.url === "string")
      .slice(0, MAX_CONTEXT_REFERENCES)
      .map((r) => {
        let title = r.title || "Source";
        if ((!title || title === "Source") && r.url) {
          try {
            title = new URL(r.url).hostname;
          } catch (error) {
            logger.error("Failed to parse URL for context reference title", {
              url: r.url,
              error,
            });
            title = r.url;
          }
        }
        const kind = r.type === "research_summary" ? undefined : r.type;
        const result: SearchResult = {
          title,
          url: r.url || "",
          snippet: "",
          relevanceScore:
            typeof r.relevanceScore === "number" ? r.relevanceScore : 0.5,
          kind,
        };
        return result;
      });
  } catch (error) {
    logger.error("Failed to map context references to search results", {
      error,
      contextReferences: msg.contextReferences,
    });
    return undefined;
  }
}

export function mapMessagesToLocal(messages: Message[]): Message[] {
  return messages.map((msg) => {
    // Synthesize searchResults from contextReferences when not present (Agents workflow)
    const searchResults = synthesizeSearchResults(msg);

    const resolvedReasoning =
      typeof msg.reasoning === "string" ? msg.reasoning : undefined;

    return {
      ...msg,
      _id: String(msg._id),
      chatId: String(msg.chatId),
      role: msg.role,
      content: msg.content ?? "",
      timestamp: msg.timestamp ?? msg._creationTime ?? Date.now(),
      searchResults,
      sources: Array.isArray(msg.sources) ? msg.sources : undefined,
      reasoning: resolvedReasoning,
    };
  });
}
