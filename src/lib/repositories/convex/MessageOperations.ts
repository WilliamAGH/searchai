import type { ConvexReactClient } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { IdUtils } from "@/lib/types/unified";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "../../../../convex/lib/errors";
import type { SearchWebResponse } from "@/lib/repositories/ChatRepository";

export class MessageOperations {
  constructor(
    private readonly client: ConvexReactClient,
    private readonly getSessionId: () => string | undefined,
  ) {}

  async getMessages(chatId: string): Promise<Doc<"messages">[]> {
    logger.debug("Fetching messages for chat", {
      chatId,
      sessionId: this.getSessionId(),
      hasSessionId: !!this.getSessionId(),
    });

    // @ts-ignore - Convex api type instantiation is excessively deep, requires this type assertion
    const messages = await this.client.query<typeof api.chats.getChatMessages>(
      api.chats.getChatMessages,
      {
        chatId: IdUtils.toConvexChatId(chatId),
        sessionId: this.getSessionId(),
      },
    );

    const result = messages ?? [];

    logger.debug("Messages fetched successfully", {
      chatId,
      count: result.length,
    });

    return result;
  }

  async getMessagesPaginated(
    chatId: string,
    limit = 50,
    cursor?: string | Id<"messages">,
  ): Promise<{
    messages: Doc<"messages">[];
    nextCursor?: Id<"messages">;
    hasMore: boolean;
  }> {
    const cursorId = cursor
      ? IdUtils.toConvexMessageId(String(cursor))
      : undefined;
    const result = await this.client.query(
      api.chats.messagesPaginated.getChatMessagesPaginated,
      {
        chatId: IdUtils.toConvexChatId(chatId),
        limit,
        cursor: cursorId,
        sessionId: this.getSessionId(),
      },
    );

    if (!result) {
      throw new Error(
        `Failed to fetch paginated messages for chat ${chatId}: received null response`,
      );
    }

    const nextCursor = result.nextCursor ?? undefined;

    const messages: Doc<"messages">[] = result.messages.map((msg) => ({
      ...msg,
      _creationTime: msg._creationTime ?? Date.now(),
      chatId: msg.chatId ?? IdUtils.toConvexChatId(chatId),
    }));

    return {
      messages,
      nextCursor,
      hasMore: result.hasMore,
    };
  }

  async addMessage(
    chatId: string,
    _message: Partial<Doc<"messages">>,
  ): Promise<Doc<"messages">> {
    throw new Error(
      `Direct message creation is not supported for chat ${chatId}. Use generateResponse instead.`,
    );
  }

  async updateMessage(
    id: string,
    updates: Partial<Doc<"messages">>,
  ): Promise<void> {
    const hasMetadataUpdates =
      updates.searchMethod !== undefined ||
      updates.hasRealResults !== undefined ||
      updates.webResearchSources !== undefined;

    const hasContentUpdates =
      updates.content !== undefined || updates.reasoning !== undefined;

    if (hasContentUpdates) {
      throw new Error(
        "Direct content/reasoning updates are not supported. These are updated during streaming.",
      );
    }

    if (!hasMetadataUpdates) {
      throw new Error(
        `No valid update fields provided for message ${id}. ` +
          "Supported fields: webResearchSources, searchMethod, hasRealResults",
      );
    }

    await this.client.mutation(api.messages.updateMessageMetadata, {
      messageId: IdUtils.toConvexMessageId(id),
      searchMethod: updates.searchMethod,
      hasRealResults: updates.hasRealResults,
      webResearchSources: updates.webResearchSources,
      sessionId: this.getSessionId(),
    });
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      await this.client.mutation(api.messages.deleteMessage, {
        messageId: IdUtils.toConvexMessageId(id),
      });
    } catch (error) {
      logger.error("Failed to delete message from Convex:", {
        error: getErrorMessage(error),
        id,
      });
      throw error;
    }
  }

  async searchWeb(query: string): Promise<SearchWebResponse> {
    try {
      return await this.client.action(api.search.searchWeb, {
        query,
        maxResults: 5,
      });
    } catch (error) {
      logger.error("Search failed:", { error: getErrorMessage(error), query });
      throw error;
    }
  }
}
