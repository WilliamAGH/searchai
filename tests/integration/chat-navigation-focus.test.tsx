/**
 * Chat Navigation Focus Integration Tests
 * Tests for autofocus behavior when navigating between chats
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageInput } from "../../src/components/MessageInput";

// Mock navigator.userAgent for consistent testing
const originalUserAgent = navigator.userAgent;

describe("Chat Navigation Focus Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set desktop user agent for focus tests
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
      writable: true,
    });
    // Reset focus
    document.body.focus();
  });

  afterEach(() => {
    // Clean up
    cleanup();
    // Restore original userAgent
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      writable: true,
    });
  });

  describe("MessageInput Focus on Chat Navigation", () => {
    it("focuses message input when chat ID changes", async () => {
      const mockSendMessage = vi.fn();

      // Initial render with chat1
      const { rerender } = render(
        <MessageInput key="chat1" onSendMessage={mockSendMessage} />,
      );

      let messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should focus initially
      await waitFor(
        () => {
          expect(document.activeElement).toBe(messageInput);
        },
        { timeout: 300 },
      );

      // Simulate navigating to a different chat by changing key
      rerender(<MessageInput key="chat2" onSendMessage={mockSendMessage} />);

      // Get the new input element (component remounted due to key change)
      messageInput = screen.getByRole("textbox", { name: /message input/i });

      // Should focus on the new chat's input
      await waitFor(
        () => {
          expect(document.activeElement).toBe(messageInput);
        },
        { timeout: 300 },
      );
    });

    it("maintains focus after sending a message", async () => {
      const mockSendMessage = vi.fn();

      render(<MessageInput onSendMessage={mockSendMessage} />);

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Wait for initial focus
      await waitFor(() => {
        expect(document.activeElement).toBe(messageInput);
      });

      // Type and send a message
      fireEvent.change(messageInput, { target: { value: "Test message" } });
      fireEvent.keyDown(messageInput, { key: "Enter", shiftKey: false });

      expect(mockSendMessage).toHaveBeenCalledWith("Test message");

      // Input should still be focused after sending
      expect(document.activeElement).toBe(messageInput);
      // Input should be cleared
      expect(messageInput).toHaveValue("");
    });

    it("does not steal focus from other inputs", async () => {
      const mockSendMessage = vi.fn();

      // Create a search input that user might be typing in
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Search chats...";
      document.body.appendChild(searchInput);

      // Focus the search input (simulating user typing)
      searchInput.focus();
      expect(document.activeElement).toBe(searchInput);

      // Render message input
      render(<MessageInput onSendMessage={mockSendMessage} />);

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Wait to ensure focus is not stolen
      await waitFor(
        () => {
          expect(document.activeElement).toBe(searchInput);
          expect(document.activeElement).not.toBe(messageInput);
        },
        { timeout: 300 },
      );

      // Clean up
      document.body.removeChild(searchInput);
    });

    it("focuses when navigating while no input has focus", async () => {
      const mockSendMessage = vi.fn();

      // Ensure body has focus (no input focused)
      document.body.focus();
      expect(document.activeElement).toBe(document.body);

      // Simulate chat navigation by rendering with a chat ID
      render(<MessageInput key="chat1" onSendMessage={mockSendMessage} />);

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should focus since no other input has focus
      await waitFor(
        () => {
          expect(document.activeElement).toBe(messageInput);
        },
        { timeout: 300 },
      );
    });

    it("handles rapid chat switching", async () => {
      const mockSendMessage = vi.fn();

      // Start with chat1
      const { rerender } = render(
        <MessageInput key="chat1" onSendMessage={mockSendMessage} />,
      );

      // Rapidly switch between chats
      rerender(<MessageInput key="chat2" onSendMessage={mockSendMessage} />);
      rerender(<MessageInput key="chat3" onSendMessage={mockSendMessage} />);
      rerender(<MessageInput key="chat1" onSendMessage={mockSendMessage} />);

      // After rapid switching, the final input should be focused
      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      await waitFor(
        () => {
          expect(document.activeElement).toBe(messageInput);
        },
        { timeout: 300 },
      );
    });
  });

  describe("Mobile Focus Behavior", () => {
    it("does not autofocus on mobile devices", async () => {
      // Set mobile user agent
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
        writable: true,
      });

      const mockSendMessage = vi.fn();

      render(<MessageInput key="chat1" onSendMessage={mockSendMessage} />);

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should NOT focus on mobile
      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(messageInput);
        },
        { timeout: 300 },
      );
    });

    it("does not focus on mobile when switching chats", async () => {
      // Set mobile user agent
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Android; Mobile; rv:40.0)",
        writable: true,
      });

      const mockSendMessage = vi.fn();

      // Start with chat1
      const { rerender } = render(
        <MessageInput key="chat1" onSendMessage={mockSendMessage} />,
      );

      let messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should not focus on mobile
      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(messageInput);
        },
        { timeout: 300 },
      );

      // Switch to chat2
      rerender(<MessageInput key="chat2" onSendMessage={mockSendMessage} />);

      messageInput = screen.getByRole("textbox", { name: /message input/i });

      // Still should not focus on mobile after switching
      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(messageInput);
        },
        { timeout: 300 },
      );
    });
  });

  describe("Focus Persistence", () => {
    it("maintains focus when re-enabling after being disabled", async () => {
      const mockSendMessage = vi.fn();

      // Start disabled
      const { rerender } = render(
        <MessageInput onSendMessage={mockSendMessage} disabled={true} />,
      );

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should not focus when disabled
      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(messageInput);
        },
        { timeout: 300 },
      );

      // Re-enable
      rerender(
        <MessageInput onSendMessage={mockSendMessage} disabled={false} />,
      );

      // Should focus when re-enabled
      await waitFor(
        () => {
          expect(document.activeElement).toBe(messageInput);
        },
        { timeout: 300 },
      );
    });

    it("does not focus when generation is in progress", async () => {
      const mockSendMessage = vi.fn();

      // Create another input and focus it
      const otherInput = document.createElement("input");
      document.body.appendChild(otherInput);
      otherInput.focus();

      render(
        <MessageInput onSendMessage={mockSendMessage} isGenerating={true} />,
      );

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should not steal focus during generation
      await waitFor(
        () => {
          expect(document.activeElement).toBe(otherInput);
          expect(document.activeElement).not.toBe(messageInput);
        },
        { timeout: 300 },
      );

      // Clean up
      document.body.removeChild(otherInput);
    });
  });

  describe("Chat History Navigation Focus", () => {
    it("maintains focus when navigating through history", async () => {
      const mockSendMessage = vi.fn();
      const history = ["Previous message 1", "Previous message 2"];

      render(
        <MessageInput onSendMessage={mockSendMessage} history={history} />,
      );

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Wait for initial focus
      await waitFor(() => {
        expect(document.activeElement).toBe(messageInput);
      });

      // Navigate through history (cursor at start, press up)
      messageInput.setSelectionRange(0, 0);
      fireEvent.keyDown(messageInput, { key: "ArrowUp" });

      // Should still be focused while navigating history
      expect(document.activeElement).toBe(messageInput);
      expect(messageInput.value).toBe("Previous message 2");
    });
  });
});
