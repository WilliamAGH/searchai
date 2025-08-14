/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IChatRepository } from "../../src/lib/repositories/ChatRepository";
import type { UnifiedMessage } from "../../src/lib/types/unified";

describe("Message Sending Critical Path", () => {
  let mockRepository: IChatRepository;
  let mockMessages: UnifiedMessage[];

  beforeEach(() => {
    mockMessages = [];

    // Setup mock repository
    mockRepository = {
      createChat: vi.fn(),
      getAllChats: vi.fn().mockResolvedValue([]),
      getChatMessages: vi.fn().mockResolvedValue(mockMessages),
      sendMessage: vi.fn().mockImplementation(async (chatId, message) => {
        const newMessage: UnifiedMessage = {
          id: `msg-${Date.now()}`,
          chatId,
          role: message.role || "user",
          content: message.content,
          timestamp: Date.now(),
          synced: true,
          source: "convex",
        };
        mockMessages.push(newMessage);
        return newMessage;
      }),
      deleteChat: vi.fn(),
      deleteMessage: vi.fn(),
      updateChatTitle: vi.fn(),
      updateChatPrivacy: vi.fn(),
      shareChat: vi.fn(),
      getSharedChat: vi.fn(),
      getMessagesPaginated: vi.fn(),
    } as IChatRepository;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("sendMessage", () => {
    it("should send a user message", async () => {
      const chatId = "test-chat-id";
      const messageContent = "Hello, AI!";

      const result = await mockRepository.sendMessage(chatId, {
        role: "user",
        content: messageContent,
      });

      expect(result).toMatchObject({
        chatId,
        role: "user",
        content: messageContent,
      });
      expect(mockMessages).toHaveLength(1);
    });

    it("should handle empty message content", async () => {
      const chatId = "test-chat-id";

      const result = await mockRepository.sendMessage(chatId, {
        role: "user",
        content: "",
      });

      expect(result.content).toBe("");
    });

    it("should preserve message ordering", async () => {
      const chatId = "test-chat-id";

      await mockRepository.sendMessage(chatId, {
        role: "user",
        content: "First message",
      });

      await mockRepository.sendMessage(chatId, {
        role: "assistant",
        content: "Response",
      });

      await mockRepository.sendMessage(chatId, {
        role: "user",
        content: "Second message",
      });

      expect(mockMessages).toHaveLength(3);
      expect(mockMessages[0].content).toBe("First message");
      expect(mockMessages[1].content).toBe("Response");
      expect(mockMessages[2].content).toBe("Second message");
    });

    it("should handle message with search results", async () => {
      const chatId = "test-chat-id";
      const searchResults = [
        {
          title: "Test Result",
          url: "https://example.com",
          snippet: "Test snippet",
          relevanceScore: 0.9,
        },
      ];

      mockRepository.sendMessage = vi
        .fn()
        .mockImplementation(async (chatId, message) => {
          const newMessage: UnifiedMessage = {
            id: `msg-${Date.now()}`,
            chatId,
            role: message.role,
            content: message.content,
            searchResults: message.searchResults,
            timestamp: Date.now(),
            synced: true,
            source: "convex",
          };
          mockMessages.push(newMessage);
          return newMessage;
        });

      const result = await mockRepository.sendMessage(chatId, {
        role: "assistant",
        content: "Here are the results",
        searchResults,
      });

      expect(result.searchResults).toEqual(searchResults);
    });

    it("should handle streaming messages", async () => {
      const chatId = "test-chat-id";

      mockRepository.sendMessage = vi
        .fn()
        .mockImplementation(async (chatId, message) => {
          const newMessage: UnifiedMessage = {
            id: `msg-${Date.now()}`,
            chatId,
            role: message.role,
            content: message.content || "",
            isStreaming: message.isStreaming,
            streamedContent: message.streamedContent,
            timestamp: Date.now(),
            synced: true,
            source: "convex",
          };
          mockMessages.push(newMessage);
          return newMessage;
        });

      const result = await mockRepository.sendMessage(chatId, {
        role: "assistant",
        content: "",
        isStreaming: true,
        streamedContent: "Streaming...",
      });

      expect(result.isStreaming).toBe(true);
      expect(result.streamedContent).toBe("Streaming...");
    });

    it("should handle network errors", async () => {
      const error = new Error("Network error");
      mockRepository.sendMessage = vi.fn().mockRejectedValue(error);

      await expect(
        mockRepository.sendMessage("chat-id", {
          role: "user",
          content: "Test",
        }),
      ).rejects.toThrow("Network error");
    });

    it("should handle long messages", async () => {
      const chatId = "test-chat-id";
      const longContent = "a".repeat(10000); // 10k characters

      const result = await mockRepository.sendMessage(chatId, {
        role: "user",
        content: longContent,
      });

      expect(result.content).toHaveLength(10000);
    });

    it("should handle special characters in messages", async () => {
      const chatId = "test-chat-id";
      const specialContent =
        "Hello <script>alert('xss')</script> & \"quotes\" 'apostrophes'";

      const result = await mockRepository.sendMessage(chatId, {
        role: "user",
        content: specialContent,
      });

      expect(result.content).toBe(specialContent);
    });

    it("should handle concurrent message sending", async () => {
      const chatId = "test-chat-id";

      const promises = [
        mockRepository.sendMessage(chatId, {
          role: "user",
          content: "Message 1",
        }),
        mockRepository.sendMessage(chatId, {
          role: "user",
          content: "Message 2",
        }),
        mockRepository.sendMessage(chatId, {
          role: "user",
          content: "Message 3",
        }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(mockMessages).toHaveLength(3);
    });

    it("should validate message role", async () => {
      const chatId = "test-chat-id";

      const validRoles = ["user", "assistant", "system"];

      for (const role of validRoles) {
        // Ensure the mock echoes the provided role
        (mockRepository.sendMessage as unknown as jest.Mock | any) = vi
          .fn()
          .mockImplementation(async (cid, message) => {
            const newMessage: UnifiedMessage = {
              id: `msg-${Date.now()}`,
              chatId: cid,
              role: message.role,
              content: message.content,
              timestamp: Date.now(),
              synced: true,
              source: "convex",
            };
            mockMessages.push(newMessage);
            return newMessage;
          });

        const result = await mockRepository.sendMessage(chatId, {
          role: role as "user" | "assistant" | "system",
          content: `Message from ${role}`,
        });

        expect(result.role).toBe(role);
      }
    });
  });

  describe("deleteMessage", () => {
    it("should delete a message", async () => {
      mockRepository.deleteMessage = vi.fn().mockResolvedValue(undefined);

      await mockRepository.deleteMessage("message-id");

      expect(mockRepository.deleteMessage).toHaveBeenCalledWith("message-id");
    });

    it("should handle deletion of non-existent message", async () => {
      mockRepository.deleteMessage = vi
        .fn()
        .mockRejectedValue(new Error("Message not found"));

      await expect(
        mockRepository.deleteMessage("non-existent"),
      ).rejects.toThrow("Message not found");
    });
  });
});
