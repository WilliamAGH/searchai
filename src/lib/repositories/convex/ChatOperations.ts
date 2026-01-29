import type { ConvexReactClient } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { IdUtils, TitleUtils } from "@/lib/types/unified";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { MAX_LOOKUP_RETRIES, computeFastBackoff } from "@/lib/constants/retry";

export class ChatOperations {
  constructor(
    private client: ConvexReactClient,
    private getSessionId: () => string | undefined,
  ) {}

  async getChats(): Promise<Doc<"chats">[]> {
    // @ts-ignore - Convex api type instantiation is excessively deep
    const chats = await this.client.query(api.chats.getUserChats, {
      sessionId: this.getSessionId(),
    });
    return chats ?? [];
  }

  async getChatById(id: string): Promise<Doc<"chats"> | null> {
    if (!IdUtils.isConvexId(id)) {
      const byOpaque = await this.client.query(api.chats.getChatByOpaqueId, {
        opaqueId: id,
        sessionId: this.getSessionId(),
      });
      return byOpaque || null;
    }

    const chat = await this.client.query(api.chats.getChatById, {
      chatId: IdUtils.toConvexChatId(id),
      sessionId: this.getSessionId(),
    });

    return chat || null;
  }

  async createChat(title?: string): Promise<{ chat: Doc<"chats">; isNew: boolean }> {
    try {
      const finalTitle = title || "New Chat";
      logger.debug("Creating chat", {
        title: finalTitle,
        sessionId: this.getSessionId(),
        hasSessionId: !!this.getSessionId(),
      });

      const chatId = await this.client.mutation(api.chats.createChat, {
        title: TitleUtils.sanitize(finalTitle),
        sessionId: this.getSessionId(),
      });

      logger.debug("Chat created with ID", {
        chatId,
        sessionId: this.getSessionId(),
      });

      const chat = await this.getChatByIdWithRetry(chatId);
      if (!chat) throw new Error("Failed to create chat");

      return { chat, isNew: true };
    } catch (error) {
      logger.error("Failed to create chat in Convex:", {
        error: getErrorMessage(error),
        sessionId: this.getSessionId(),
      });
      throw error;
    }
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    try {
      await this.client.mutation(api.chats.updateChatTitle, {
        chatId: IdUtils.toConvexChatId(id),
        title: TitleUtils.sanitize(title),
      });
    } catch (error) {
      logger.error("Failed to update chat title in Convex:", {
        error: getErrorMessage(error),
        id,
      });
      throw error;
    }
  }

  async updateChatPrivacy(id: string, privacy: "private" | "shared" | "public"): Promise<void> {
    try {
      await this.client.mutation(api.chats.updateChatPrivacy, {
        chatId: IdUtils.toConvexChatId(id),
        privacy,
      });
    } catch (error) {
      logger.error("Failed to update chat privacy in Convex:", {
        error: getErrorMessage(error),
        id,
        privacy,
      });
      throw error;
    }
  }

  async deleteChat(id: string): Promise<void> {
    try {
      await this.client.mutation(api.chats.deleteChat, {
        chatId: IdUtils.toConvexChatId(id),
        sessionId: this.getSessionId(),
      });
    } catch (error) {
      logger.error("Failed to delete chat from Convex:", {
        error: getErrorMessage(error),
        id,
      });
      throw error;
    }
  }

  async shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }> {
    try {
      await this.updateChatPrivacy(id, privacy);
      const chat = await this.getChatById(id);

      return {
        shareId: chat?.shareId,
        publicId: chat?.publicId,
      };
    } catch (error) {
      logger.error("Failed to share chat:", {
        error: getErrorMessage(error),
        id,
        privacy,
      });
      throw error;
    }
  }

  async getChatByShareId(shareId: string): Promise<Doc<"chats"> | null> {
    const chat = await this.client.query(api.chats.getChatByShareId, {
      shareId,
    });
    return chat || null;
  }

  async getChatByPublicId(publicId: string): Promise<Doc<"chats"> | null> {
    const chat = await this.client.query(api.chats.getChatByPublicId, {
      publicId,
    });
    return chat || null;
  }

  private async getChatByIdWithRetry(
    chatId: Id<"chats">,
    maxAttempts = MAX_LOOKUP_RETRIES,
  ): Promise<Doc<"chats"> | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const chat = await this.client.query(api.chats.getChatByIdDirect, {
          chatId,
          sessionId: this.getSessionId(),
        });

        if (chat) {
          logger.debug("Chat retrieved successfully", {
            chatId,
            attempt,
            sessionId: this.getSessionId(),
          });
          return chat;
        }

        if (attempt < maxAttempts - 1) {
          const delay = computeFastBackoff(attempt);
          logger.debug("Chat not found, retrying", {
            chatId,
            attempt,
            delay,
            sessionId: this.getSessionId(),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error("Error fetching chat", {
          chatId,
          attempt,
          error: getErrorMessage(error),
          sessionId: this.getSessionId(),
        });
        throw error;
      }
    }

    logger.error("Failed to retrieve chat after retries", {
      chatId,
      maxAttempts,
      sessionId: this.getSessionId(),
    });
    return null;
  }
}
