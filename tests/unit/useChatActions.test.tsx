import { test, expect, describe, beforeEach, vi } from "vitest";
import { createChatActions } from "../../src/hooks/useChatActions";
import type { ChatState } from "../../src/hooks/useChatState";
import type { IChatRepository } from "../../src/lib/repositories/ChatRepository";
import type { UnifiedChat, UnifiedMessage } from "../../src/lib/types/unified";

// Mock the logger
vi.mock("../../src/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useChatActions", () => {
  let mockRepository: IChatRepository;
  let mockState: ChatState;
  let mockSetState: ReturnType<typeof vi.fn>;
  let actions: ReturnType<typeof createChatActions>;

  beforeEach(() => {
    // Setup mock repository
    mockRepository = {
      storageType: "local",
      getChats: vi.fn().mockResolvedValue([]),
      getChatById: vi.fn().mockResolvedValue(null),
      createChat: vi.fn(),
      deleteChat: vi.fn().mockResolvedValue(undefined),
      getMessages: vi.fn().mockResolvedValue([]),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      updateChatTitle: vi.fn().mockResolvedValue(undefined),
      updateChatPrivacy: vi.fn().mockResolvedValue(undefined),
      subscribeToChat: vi.fn(),
      supportsStreaming: vi.fn().mockReturnValue(false),
      getMessagesPaginated: vi.fn(),
      loadMoreMessages: vi.fn(),
    } as any;

    // Setup mock state
    mockState = {
      chats: [],
      currentChatId: null,
      currentChat: null,
      messages: [],
      isLoading: false,
      isGenerating: false,
      error: null,
      searchProgress: null,
      showFollowUpPrompt: false,
      pendingMessage: "",
      plannerHint: null,
      undoBanner: null,
      messageCount: 0,
      showShareModal: false,
      userHistory: [],
      isMobile: false,
      isSidebarOpen: false,
    };

    // Setup mock setState
    mockSetState = vi.fn((updater) => {
      if (typeof updater === "function") {
        mockState = updater(mockState);
      } else {
        mockState = updater;
      }
      return mockState;
    });

    // Create actions
    actions = createChatActions(mockRepository, mockState, mockSetState);
  });

  describe("createChat", () => {
    test("should create a new chat successfully", async () => {
      const newChat: UnifiedChat = {
        id: "chat-123",
        title: "Test Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        privacy: "private",
        source: "local",
        synced: false,
      };

      mockRepository.createChat = vi
        .fn()
        .mockResolvedValue({ chat: newChat, isNew: true });

      const result = await actions.createChat("Test Chat");

      expect(mockRepository.createChat).toHaveBeenCalledWith("Test Chat");
      expect(result).toEqual(newChat);
      expect(mockSetState).toHaveBeenCalled();
    });

    test("should handle createChat errors", async () => {
      mockRepository.createChat = vi
        .fn()
        .mockRejectedValue(new Error("Creation failed"));

      await expect(actions.createChat("Test")).rejects.toThrow(
        "Creation failed",
      );
    });

    test("should throw error when repository is null", async () => {
      const actionsWithoutRepo = createChatActions(
        null,
        mockState,
        mockSetState,
      );

      await expect(actionsWithoutRepo.createChat()).rejects.toThrow(
        "Repository not initialized",
      );
    });
  });

  describe("selectChat", () => {
    test("should select a chat by ID", async () => {
      const mockChat: UnifiedChat = {
        id: "chat-456",
        title: "Selected Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        privacy: "private",
        source: "local",
        synced: false,
      };

      const mockMessages: UnifiedMessage[] = [
        {
          id: "msg-1",
          chatId: "chat-456",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
        },
      ];

      mockRepository.getChatById = vi.fn().mockResolvedValue(mockChat);
      mockRepository.getMessages = vi.fn().mockResolvedValue(mockMessages);

      await actions.selectChat("chat-456");

      expect(mockRepository.getChatById).toHaveBeenCalledWith("chat-456");
      expect(mockRepository.getMessages).toHaveBeenCalledWith("chat-456");
      expect(mockSetState).toHaveBeenCalled();
    });

    test("should clear selection when null is passed", async () => {
      await actions.selectChat(null);

      expect(mockSetState).toHaveBeenCalledWith(expect.any(Function));
      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.currentChatId).toBeNull();
      expect(newState.currentChat).toBeNull();
      expect(newState.messages).toEqual([]);
    });

    test("should handle errors when selecting chat", async () => {
      mockRepository.getChatById = vi
        .fn()
        .mockRejectedValue(new Error("Chat not found"));

      await actions.selectChat("invalid-id");

      expect(mockSetState).toHaveBeenCalled();
      const updater =
        mockSetState.mock.calls[mockSetState.mock.calls.length - 1][0];
      const newState = updater(mockState);
      expect(newState.error).toBeTruthy();
    });
  });

  describe("deleteChat", () => {
    test("should delete a chat successfully", async () => {
      mockState.chats = [
        { id: "chat-1", title: "Chat 1" } as UnifiedChat,
        { id: "chat-2", title: "Chat 2" } as UnifiedChat,
      ];
      mockState.currentChatId = "chat-1";

      await actions.deleteChat("chat-1");

      expect(mockRepository.deleteChat).toHaveBeenCalledWith("chat-1");
      expect(mockSetState).toHaveBeenCalled();
    });

    test("should handle delete errors", async () => {
      mockRepository.deleteChat = vi
        .fn()
        .mockRejectedValue(new Error("Delete failed"));

      await expect(actions.deleteChat("chat-1")).rejects.toThrow(
        "Delete failed",
      );
    });
  });

  describe("sendMessage", () => {
    test("should send a message successfully", async () => {
      await actions.sendMessage("chat-123", "Hello world");

      expect(mockSetState).toHaveBeenCalled();
      // Verify loading state was set
      const firstCall = mockSetState.mock.calls[0][0];
      const loadingState = firstCall(mockState);
      expect(loadingState.isGenerating).toBe(true);
    });
  });

  describe("UI state management", () => {
    test("should toggle sidebar", () => {
      // Start with sidebar closed
      mockState.isSidebarOpen = false;

      actions.handleToggleSidebar();

      // The handleToggleSidebar function toggles the current state
      expect(mockSetState).toHaveBeenCalled();
      const updater = mockSetState.mock.calls[0][0];
      const newState = updater({ ...mockState, isSidebarOpen: false });
      expect(newState.isSidebarOpen).toBe(true);

      // Test toggling back
      const newState2 = updater({ ...mockState, isSidebarOpen: true });
      expect(newState2.isSidebarOpen).toBe(false);
    });

    test("should set show follow up prompt", () => {
      actions.setShowFollowUpPrompt(true);

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.showFollowUpPrompt).toBe(true);
    });

    test("should set show share modal", () => {
      actions.setShowShareModal(true);

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.showShareModal).toBe(true);
    });

    test("should set pending message", () => {
      actions.setPendingMessage("Test message");

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.pendingMessage).toBe("Test message");
    });

    test("should add to history", () => {
      actions.addToHistory("Historical message");

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.userHistory).toContain("Historical message");
    });
  });

  describe("chat state management", () => {
    test("should set chats", () => {
      const newChats: UnifiedChat[] = [
        { id: "chat-1", title: "Chat 1" } as UnifiedChat,
        { id: "chat-2", title: "Chat 2" } as UnifiedChat,
      ];

      actions.setChats(newChats);

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.chats).toEqual(newChats);
    });

    test("should add a chat", () => {
      const newChat: UnifiedChat = {
        id: "chat-new",
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        privacy: "private",
        source: "local",
        synced: false,
      };

      actions.addChat(newChat);

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.chats).toContain(newChat);
    });

    test("should remove a chat", () => {
      mockState.chats = [
        { id: "chat-1", title: "Chat 1" } as UnifiedChat,
        { id: "chat-2", title: "Chat 2" } as UnifiedChat,
      ];

      actions.removeChat("chat-1");

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.chats).toHaveLength(1);
      expect(newState.chats[0].id).toBe("chat-2");
    });

    test("should update a chat", () => {
      mockState.chats = [{ id: "chat-1", title: "Old Title" } as UnifiedChat];

      actions.updateChat("chat-1", { title: "New Title" });

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.chats[0].title).toBe("New Title");
    });
  });

  describe("message management", () => {
    test("should set messages", () => {
      const newMessages: UnifiedMessage[] = [
        { id: "msg-1", role: "user", content: "Hello" } as UnifiedMessage,
        { id: "msg-2", role: "assistant", content: "Hi" } as UnifiedMessage,
      ];

      actions.setMessages(newMessages);

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.messages).toEqual(newMessages);
    });

    test("should add a message", () => {
      const newMessage: UnifiedMessage = {
        id: "msg-new",
        role: "user",
        content: "New message",
        timestamp: Date.now(),
      };

      actions.addMessage(newMessage);

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.messages).toContain(newMessage);
    });

    test("should remove a message", () => {
      mockState.messages = [
        { id: "msg-1", content: "Message 1" } as UnifiedMessage,
        { id: "msg-2", content: "Message 2" } as UnifiedMessage,
      ];

      actions.removeMessage("msg-1");

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.messages).toHaveLength(1);
      expect(newState.messages[0].id).toBe("msg-2");
    });

    test("should update a message", () => {
      mockState.messages = [
        { id: "msg-1", content: "Old content" } as UnifiedMessage,
      ];

      actions.updateMessage("msg-1", { content: "New content" });

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.messages[0].content).toBe("New content");
    });
  });

  describe("utility actions", () => {
    test("should refresh chats", async () => {
      const mockChats: UnifiedChat[] = [
        { id: "chat-1", title: "Chat 1" } as UnifiedChat,
      ];

      mockRepository.getChats = vi.fn().mockResolvedValue(mockChats);

      await actions.refreshChats();

      expect(mockRepository.getChats).toHaveBeenCalled();
      expect(mockSetState).toHaveBeenCalled();
    });

    test("should clear error", () => {
      mockState.error = new Error("Some error");

      actions.clearError();

      const updater = mockSetState.mock.calls[0][0];
      const newState = updater(mockState);
      expect(newState.error).toBeNull();
    });

    test("should clear local storage", () => {
      const localStorageSpy = vi.spyOn(Storage.prototype, "clear");

      actions.clearLocalStorage();

      expect(localStorageSpy).toHaveBeenCalled();

      localStorageSpy.mockRestore();
    });
  });
});
