import type { SearchMethod } from "./lib/constants/search";
import type { WebResearchSource } from "./lib/validators";

/**
 * Persistable fields for a messages table insert.
 * Transport-only fields (sessionId/workflowTokenId) are intentionally excluded.
 */
export interface PersistableMessageArgs {
  role: "user" | "assistant";
  content?: string;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;
  reasoning?: string;
  searchMethod?: SearchMethod;
  hasRealResults?: boolean;
  webResearchSources?: WebResearchSource[];
  workflowId?: string;
}

export interface MessageInsertDocument<TChatId extends string = string> {
  chatId: TChatId;
  messageId: string;
  threadId: string;
  role: "user" | "assistant";
  content?: string;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;
  reasoning?: string;
  searchMethod?: SearchMethod;
  hasRealResults?: boolean;
  webResearchSources?: WebResearchSource[];
  workflowId?: string;
  timestamp: number;
}

export interface BuildMessageInsertDocumentParams<
  TChatId extends string = string,
> {
  chatId: TChatId;
  messageId: string;
  threadId: string;
  args: PersistableMessageArgs;
  timestamp?: number;
}

/**
 * Build a messages insert payload using explicit field mapping.
 * This prevents accidental persistence of extra transport-only args.
 */
export function buildMessageInsertDocument<TChatId extends string>(
  params: BuildMessageInsertDocumentParams<TChatId>,
): MessageInsertDocument<TChatId> {
  const { chatId, messageId, threadId, args, timestamp = Date.now() } = params;

  const message: MessageInsertDocument<TChatId> = {
    chatId,
    messageId,
    threadId,
    role: args.role,
    timestamp,
  };

  if (args.content !== undefined) {
    message.content = args.content;
  }
  if (args.isStreaming !== undefined) {
    message.isStreaming = args.isStreaming;
  }
  if (args.streamedContent !== undefined) {
    message.streamedContent = args.streamedContent;
  }
  if (args.thinking !== undefined) {
    message.thinking = args.thinking;
  }
  if (args.reasoning !== undefined) {
    message.reasoning = args.reasoning;
  }
  if (args.searchMethod !== undefined) {
    message.searchMethod = args.searchMethod;
  }
  if (args.hasRealResults !== undefined) {
    message.hasRealResults = args.hasRealResults;
  }
  if (args.webResearchSources !== undefined) {
    message.webResearchSources = args.webResearchSources;
  }
  if (args.workflowId !== undefined) {
    message.workflowId = args.workflowId;
  }

  return message;
}
