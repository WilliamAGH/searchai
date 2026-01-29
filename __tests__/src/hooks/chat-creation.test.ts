/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChatActions } from "../../../src/hooks/useChatActions";
import type { ChatState } from "../../../src/hooks/useChatState";
import type { IChatRepository } from "../../../src/lib/repositories/ChatRepository";
import type { UnifiedChat } from "../../../src/lib/types/unified";

describe("Chat Creation Critical Path", () => {
  let mockRepository: IChatRepository;
  let mockState: ChatState;
  let mockSetState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Setup mock repository
    mockRepository = {
      createChat: vi.fn().mockResolvedValue({
        chat: {
          id: "test-chat-id",
          title: "New Chat",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: "convex",
          synced: true,
        } as UnifiedChat,
      }),
      getChats: vi.fn().mockResolvedValue([]),
      getChatById: vi.fn().mockResolvedValue(null),
      getMessages: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn(),
      deleteChat: vi.fn(),
      deleteMessage: vi.fn(),
      updateChatTitle: vi.fn(),
      updateChatPrivacy: vi.fn(),
      shareChat: vi.fn(),
      getSharedChat: vi.fn(),
      getMessagesPaginated: vi.fn(),
    } as IChatRepository;

    // Setup mock state
    mockState = {
      chats: [],
      messages: [],
      currentChatId: null,
      isLoading: false,
      error: null,
      draft: "",
      showSidebar: false,
      searchProgress: null,
      isGenerating: false,
      showFollowUpPrompt: false,
      showShareModal: false,
      pendingMessage: "",
      messageHistory: [],
    };

    mockSetState = vi.fn((updater) => {
      if (typeof updater === "function") {
        mockState = updater(mockState);
      } else {
        mockState = updater;
      }
    });
  });

  describe("createChat", () => {
    it("should create a new chat with default title", async () => {
      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      const result = await actions.createChat();

      // The createChat action now provides "New Chat" as default
      expect(mockRepository.createChat).toHaveBeenCalledWith("New Chat");
      expect(result).toMatchObject({
        id: "test-chat-id",
        title: "New Chat",
      });
    });

    it("should create a new chat with custom title", async () => {
      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.createChat("Custom Title");

      expect(mockRepository.createChat).toHaveBeenCalledWith("Custom Title");
    });

    it("should update state after creating chat", async () => {
      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.createChat();

      // Check that setState was called to add the new chat
      expect(mockSetState).toHaveBeenCalled();
      const updateCall = mockSetState.mock.calls.find(
        (call) => typeof call[0] === "function",
      );
      expect(updateCall).toBeDefined();
    });

    it("should handle creation errors gracefully", async () => {
      const error = new Error("Creation failed");
      mockRepository.createChat = vi.fn().mockRejectedValue(error);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await expect(actions.createChat()).rejects.toThrow("Creation failed");
    });

    it("should throw error when repository is null", async () => {
      const actions = createChatActions(null, mockState, mockSetState);

      await expect(actions.createChat()).rejects.toThrow(
        "Repository not initialized",
      );
    });
  });

  describe("selectChat", () => {
    it("should select an existing chat", async () => {
      const existingChat: UnifiedChat = {
        id: "existing-chat",
        title: "Existing Chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "convex",
        synced: true,
      };

      mockState.chats = [existingChat];
      mockRepository.getChatById = vi.fn().mockResolvedValue(existingChat);
      mockRepository.getMessages = vi.fn().mockResolvedValue([]);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.selectChat("existing-chat");

      expect(mockRepository.getMessages).toHaveBeenCalledWith("existing-chat");
      expect(mockSetState).toHaveBeenCalled();
    });

    it("should deselect chat when null is passed", async () => {
      mockState.currentChatId = "some-chat";

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.selectChat(null);

      const updateCall = mockSetState.mock.calls.find(
        (call) => typeof call[0] === "function",
      );
      expect(updateCall).toBeDefined();
    });

    it("should handle non-existent chat gracefully", async () => {
      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      // Should not throw, just log warning
      await expect(actions.selectChat("non-existent")).resolves.not.toThrow();
    });
  });

  describe("deleteChat", () => {
    it("should delete a chat", async () => {
      const chatToDelete: UnifiedChat = {
        id: "chat-to-delete",
        title: "Chat to Delete",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "convex",
        synced: true,
      };

      mockState.chats = [chatToDelete];
      mockRepository.deleteChat = vi.fn().mockResolvedValue(undefined);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.deleteChat("chat-to-delete");

      expect(mockRepository.deleteChat).toHaveBeenCalledWith("chat-to-delete");
      expect(mockSetState).toHaveBeenCalled();
    });

    it("should deselect chat if it's currently selected", async () => {
      const chatToDelete: UnifiedChat = {
        id: "chat-to-delete",
        title: "Chat to Delete",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "convex",
        synced: true,
      };

      mockState.chats = [chatToDelete];
      mockState.currentChatId = "chat-to-delete";
      mockRepository.deleteChat = vi.fn().mockResolvedValue(undefined);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.deleteChat("chat-to-delete");

      // Verify state was updated to deselect the chat
      const updateCalls = mockSetState.mock.calls;
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it("should handle deletion errors", async () => {
      const error = new Error("Deletion failed");
      mockRepository.deleteChat = vi.fn().mockRejectedValue(error);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      // The deleteChat method throws the error after updating state
      await expect(actions.deleteChat("chat-id")).rejects.toThrow(
        "Deletion failed",
      );

      // Verify state was still updated with the error
      expect(mockSetState).toHaveBeenCalled();
    });
  });

  describe("updateChatTitle", () => {
    it("should update chat title", async () => {
      const chat: UnifiedChat = {
        id: "chat-id",
        title: "Old Title",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "convex",
        synced: true,
      };

      mockState.chats = [chat];
      mockRepository.updateChatTitle = vi.fn().mockResolvedValue(undefined);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      await actions.updateChatTitle("chat-id", "New Title");

      expect(mockRepository.updateChatTitle).toHaveBeenCalledWith(
        "chat-id",
        "New Title",
      );
      expect(mockSetState).toHaveBeenCalled();
    });

    it("should pass the title through without modification", async () => {
      const chat: UnifiedChat = {
        id: "chat-id",
        title: "Old Title",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "convex",
        synced: true,
      };

      mockState.chats = [chat];
      mockRepository.updateChatTitle = vi.fn().mockResolvedValue(undefined);

      const actions = createChatActions(
        mockRepository,
        mockState,
        mockSetState,
      );

      // Title is passed through without trimming in this layer
      await actions.updateChatTitle("chat-id", "  New Title  ");

      expect(mockRepository.updateChatTitle).toHaveBeenCalledWith(
        "chat-id",
        "  New Title  ",
      );
    });
  });
});
