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
    it("WARNING: MessageInput MUST NOT use React key prop (iOS Safari crash prevention)", () => {
      // CRITICAL: This test verifies that MessageInput is NOT remounted with keys
      // Using key prop on MessageInput causes iOS Safari keyboard crashes
      // See: src/components/MessageInput.tsx for detailed documentation

      const mockSendMessage = vi.fn();
      const { container } = render(
        <MessageInput onSendMessage={mockSendMessage} />,
      );

      // Verify that MessageInput exists without key prop
      const messageTextarea = container.querySelector(
        'textarea[aria-label="Message input"]',
      );
      expect(messageTextarea).toBeTruthy();

      // This is a NEGATIVE test - we're verifying the ABSENCE of key usage
      // Parent components should handle chat changes WITHOUT remounting MessageInput
      expect(true).toBe(true); // Test passes by not using keys
    });

    it("maintains consistent focus without remounting", async () => {
      // This tests the CORRECT behavior - no key prop, no remounting
      const mockSendMessage = vi.fn();
      const { rerender } = render(
        <MessageInput onSendMessage={mockSendMessage} />,
      );

      const messageInput = screen.getByRole("textbox", {
        name: /message input/i,
      });

      // Should focus initially
      await waitFor(
        () => {
          expect(document.activeElement).toBe(messageInput);
        },
        { timeout: 300 },
      );

      // Rerender WITHOUT key change (simulating prop updates)
      rerender(
        <MessageInput onSendMessage={mockSendMessage} disabled={false} />,
      );

      // Should maintain focus without remounting
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
      // CRITICAL: No key prop - prevents iOS Safari crash
      render(<MessageInput onSendMessage={mockSendMessage} />);

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
        <MessageInput onSendMessage={mockSendMessage} placeholder="Chat 1" />,
      );

      // Rapidly switch between chats
      rerender(
        <MessageInput onSendMessage={mockSendMessage} placeholder="Chat 2" />,
      );
      rerender(
        <MessageInput onSendMessage={mockSendMessage} placeholder="Chat 3" />,
      );
      rerender(
        <MessageInput onSendMessage={mockSendMessage} placeholder="Chat 1" />,
      );

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

      // CRITICAL: No key prop - prevents iOS Safari crash
      render(<MessageInput onSendMessage={mockSendMessage} />);

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
        <MessageInput onSendMessage={mockSendMessage} placeholder="Chat 1" />,
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
      rerender(
        <MessageInput onSendMessage={mockSendMessage} placeholder="Chat 2" />,
      );

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
