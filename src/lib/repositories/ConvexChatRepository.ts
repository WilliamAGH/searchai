/**
 * Convex Chat Repository Implementation
 * Handles chat operations for authenticated users using Convex backend
 */

import type { ConvexReactClient } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { BaseRepository, type SearchWebResponse } from "@/lib/repositories/ChatRepository";
import type { MessageStreamChunk } from "@/lib/types/message";
import { logger } from "@/lib/logger";
import { ChatOperations } from "./convex/ChatOperations";
import { MessageOperations } from "./convex/MessageOperations";
import { ConvexStreamHandler } from "./convex/ConvexStreamHandler";

export class ConvexChatRepository extends BaseRepository {
  protected storageType = "convex" as const;
  private client: ConvexReactClient;
  private sessionId?: string;

  private chatOps: ChatOperations;
  private messageOps: MessageOperations;
  private streamHandler: ConvexStreamHandler;

  constructor(client: ConvexReactClient, sessionId?: string) {
    super();
    this.client = client;
    this.sessionId = sessionId;

    const getSessionId = () => this.sessionId;

    this.chatOps = new ChatOperations(client, getSessionId);
    this.messageOps = new MessageOperations(client, getSessionId);
    this.streamHandler = new ConvexStreamHandler(client, sessionId, (chatId) =>
      this.messageOps.getMessages(chatId),
    );

    logger.debug("ConvexChatRepository initialized", {
      hasSessionId: !!sessionId,
      sessionId,
    });
  }

  setSessionId(sessionId: string | undefined) {
    this.sessionId = sessionId;
    // streamHandler might hold old sessionId if passed by value in constructor
    // so we recreate it or update it. Since ConvexStreamHandler stores sessionId,
    // we should ideally update it there too.
    // For simplicity, re-instantiate streamHandler or add setter.
    // Re-instantiation is safer.
    this.streamHandler = new ConvexStreamHandler(this.client, sessionId, (chatId) =>
      this.messageOps.getMessages(chatId),
    );

    logger.debug("ConvexChatRepository sessionId updated", {
      hasSessionId: !!sessionId,
      sessionId,
    });
  }

  // Delegate Chat Operations
  async getChats(): Promise<Doc<"chats">[]> {
    return this.chatOps.getChats();
  }

  async getChatById(id: string): Promise<Doc<"chats"> | null> {
    return this.chatOps.getChatById(id);
  }

  async createChat(title?: string): Promise<{ chat: Doc<"chats">; isNew: boolean }> {
    return this.chatOps.createChat(title);
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    return this.chatOps.updateChatTitle(id, title);
  }

  async updateChatPrivacy(id: string, privacy: "private" | "shared" | "public"): Promise<void> {
    return this.chatOps.updateChatPrivacy(id, privacy);
  }

  async deleteChat(id: string): Promise<void> {
    return this.chatOps.deleteChat(id);
  }

  async shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }> {
    return this.chatOps.shareChat(id, privacy);
  }

  async getChatByShareId(shareId: string): Promise<Doc<"chats"> | null> {
    return this.chatOps.getChatByShareId(shareId);
  }

  async getChatByPublicId(publicId: string): Promise<Doc<"chats"> | null> {
    return this.chatOps.getChatByPublicId(publicId);
  }

  // Delegate Message Operations
  async getMessages(chatId: string): Promise<Doc<"messages">[]> {
    return this.messageOps.getMessages(chatId);
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
    return this.messageOps.getMessagesPaginated(chatId, limit, cursor);
  }

  async addMessage(chatId: string, message: Partial<Doc<"messages">>): Promise<Doc<"messages">> {
    return this.messageOps.addMessage(chatId, message);
  }

  async updateMessage(id: string, updates: Partial<Doc<"messages">>): Promise<void> {
    return this.messageOps.updateMessage(id, updates);
  }

  async deleteMessage(id: string): Promise<void> {
    return this.messageOps.deleteMessage(id);
  }

  async searchWeb(query: string): Promise<SearchWebResponse> {
    return this.messageOps.searchWeb(query);
  }

  // Delegate Streaming
  generateResponse(chatId: string, message: string): AsyncGenerator<MessageStreamChunk> {
    return this.streamHandler.generateResponse(chatId, message);
  }
}
