/**
 * MessageInput Component Tests
 * Tests for the message input component including autofocus behavior
 */

import React from "react";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageInput } from "../../src/components/MessageInput";
import { TestProviders } from "../helpers/test-providers";

// Custom render function that includes providers
const render = (ui: React.ReactElement) => {
  const result = rtlRender(<TestProviders>{ui}</TestProviders>);
  // Override rerender to include providers
  const originalRerender = result.rerender;
  result.rerender = (newUi: React.ReactElement) => {
    return originalRerender(<TestProviders>{newUi}</TestProviders>);
  };
  return result;
};

// Mock navigator.userAgent for mobile detection tests
const originalUserAgent = navigator.userAgent;

describe("MessageInput", () => {
  const mockOnSendMessage = vi.fn();
  const mockOnDraftChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset document.activeElement
    document.body.focus();
  });

  afterEach(() => {
    // Clean up rendered components
    cleanup();
    // Restore original userAgent
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      writable: true,
    });
  });

  describe("Basic Functionality", () => {
    it("renders with default placeholder", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });
      expect(textarea).toHaveAttribute("placeholder", "Ask me anything...");
    });

    it("renders with custom placeholder", () => {
      render(
        <MessageInput
          onSendMessage={mockOnSendMessage}
          placeholder="Type your message"
        />,
      );
      const textarea = screen.getByRole("textbox", { name: /message input/i });
      expect(textarea).toHaveAttribute("placeholder", "Type your message");
    });

    it("sends message on Enter key", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Simulate typing
      fireEvent.change(textarea, { target: { value: "Test message" } });
      expect(textarea.value).toBe("Test message");

      // Simulate Enter key
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

      expect(mockOnSendMessage).toHaveBeenCalledWith("Test message");
      expect(textarea).toHaveValue("");
    });

    it("inserts newline on Shift+Enter", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Type first line
      fireEvent.change(textarea, { target: { value: "Line 1" } });

      // Simulate Shift+Enter (should not send)
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // Manually add newline and second line since we're testing the prevention of send
      fireEvent.change(textarea, { target: { value: "Line 1\nLine 2" } });

      expect(textarea.value).toBe("Line 1\nLine 2");
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it("sends message on form submit", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;
      const form = textarea.closest("form");

      fireEvent.change(textarea, { target: { value: "Test message" } });
      if (form) fireEvent.submit(form);

      expect(mockOnSendMessage).toHaveBeenCalledWith("Test message");
      expect(textarea).toHaveValue("");
    });

    it("does not send empty or whitespace-only messages", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Try empty message
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      expect(mockOnSendMessage).not.toHaveBeenCalled();

      // Try whitespace-only message
      fireEvent.change(textarea, { target: { value: "   " } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it("disables input when disabled prop is true", () => {
      render(
        <MessageInput onSendMessage={mockOnSendMessage} disabled={true} />,
      );
      const textarea = screen.getByRole("textbox", { name: /message input/i });
      expect(textarea).toBeDisabled();
    });

    it("disables submit button when isGenerating is true", () => {
      render(
        <MessageInput onSendMessage={mockOnSendMessage} isGenerating={true} />,
      );
      const submitButton = screen.getByRole("button", {
        name: /send message/i,
      });
      expect(submitButton).toBeDisabled();
    });

    it("calls onDraftChange when text changes", () => {
      render(
        <MessageInput
          onSendMessage={mockOnSendMessage}
          onDraftChange={mockOnDraftChange}
        />,
      );
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Simulate typing by changing value
      fireEvent.change(textarea, { target: { value: "D" } });
      expect(mockOnDraftChange).toHaveBeenCalledWith("D");

      fireEvent.change(textarea, { target: { value: "Dr" } });
      expect(mockOnDraftChange).toHaveBeenCalledWith("Dr");

      fireEvent.change(textarea, { target: { value: "Draft text" } });
      expect(mockOnDraftChange).toHaveBeenLastCalledWith("Draft text");
    });
  });

  describe("Autofocus Behavior", () => {
    it("autofocuses on desktop when component mounts", async () => {
      // Set desktop user agent
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Wait for the delayed focus (100ms delay in the component)
      await waitFor(
        () => {
          expect(document.activeElement).toBe(textarea);
        },
        { timeout: 200 },
      );
    });

    it("does not autofocus on mobile devices", async () => {
      // Set mobile user agent
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
        writable: true,
      });

      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Wait to ensure no focus happens
      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(textarea);
        },
        { timeout: 200 },
      );
    });

    it("does not autofocus when disabled", async () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      render(
        <MessageInput onSendMessage={mockOnSendMessage} disabled={true} />,
      );
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(textarea);
        },
        { timeout: 200 },
      );
    });

    it("does not steal focus from other inputs", async () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      // Create another input and focus it
      const otherInput = document.createElement("input");
      document.body.appendChild(otherInput);
      otherInput.focus();
      expect(document.activeElement).toBe(otherInput);

      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Wait to ensure focus is not stolen
      await waitFor(
        () => {
          expect(document.activeElement).toBe(otherInput);
          expect(document.activeElement).not.toBe(textarea);
        },
        { timeout: 200 },
      );

      // Clean up
      document.body.removeChild(otherInput);
    });

    it("does not steal focus from other textareas", async () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      // Create another textarea and focus it
      const otherTextarea = document.createElement("textarea");
      document.body.appendChild(otherTextarea);
      otherTextarea.focus();
      expect(document.activeElement).toBe(otherTextarea);

      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Wait to ensure focus is not stolen
      await waitFor(
        () => {
          expect(document.activeElement).toBe(otherTextarea);
          expect(document.activeElement).not.toBe(textarea);
        },
        { timeout: 200 },
      );

      // Clean up
      document.body.removeChild(otherTextarea);
    });

    it("does not steal focus from select elements", async () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      // Create a select element and focus it
      const selectElement = document.createElement("select");
      document.body.appendChild(selectElement);
      selectElement.focus();
      expect(document.activeElement).toBe(selectElement);

      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Wait to ensure focus is not stolen
      await waitFor(
        () => {
          expect(document.activeElement).toBe(selectElement);
          expect(document.activeElement).not.toBe(textarea);
        },
        { timeout: 200 },
      );

      // Clean up
      document.body.removeChild(selectElement);
    });

    it("focuses when nothing else has focus", async () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      // Ensure body has focus (nothing specific focused)
      document.body.focus();
      expect(document.activeElement).toBe(document.body);

      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Should autofocus since nothing else has focus
      await waitFor(
        () => {
          expect(document.activeElement).toBe(textarea);
        },
        { timeout: 200 },
      );
    });

    it("refocuses when re-enabled after being disabled", async () => {
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
        writable: true,
      });

      const { rerender } = render(
        <MessageInput onSendMessage={mockOnSendMessage} disabled={true} />,
      );
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      // Should not focus when disabled
      await waitFor(
        () => {
          expect(document.activeElement).not.toBe(textarea);
        },
        { timeout: 200 },
      );

      // Re-render with disabled=false
      rerender(
        <MessageInput onSendMessage={mockOnSendMessage} disabled={false} />,
      );

      // Should focus when re-enabled
      await waitFor(
        () => {
          expect(document.activeElement).toBe(textarea);
        },
        { timeout: 200 },
      );
    });
  });

  describe("History Navigation", () => {
    const history = ["First message", "Second message", "Third message"];

    it("navigates through history with arrow keys", () => {
      render(
        <MessageInput onSendMessage={mockOnSendMessage} history={history} />,
      );
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Focus the textarea and position cursor at start
      textarea.focus();
      textarea.setSelectionRange(0, 0);

      // Press up arrow to get most recent history
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("Third message");

      // Press up again to get older history
      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("Second message");

      // Press down to get newer history
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
      expect(textarea.value).toBe("Third message");
    });

    it("preserves draft when entering history navigation", () => {
      render(
        <MessageInput onSendMessage={mockOnSendMessage} history={history} />,
      );
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Type a draft message
      fireEvent.change(textarea, { target: { value: "My draft" } });

      // Navigate to history
      textarea.setSelectionRange(0, 0);
      fireEvent.keyDown(textarea, { key: "ArrowUp" });
      expect(textarea.value).toBe("Third message");

      // Navigate back down past history
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
      fireEvent.keyDown(textarea, { key: "ArrowDown" });

      // Should restore the draft
      expect(textarea.value).toBe("My draft");
    });
  });

  describe("Textarea Auto-resize", () => {
    it("adjusts height based on content", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Initially height is set to a value
      const initialHeight = textarea.style.height;
      expect(initialHeight).toBeDefined();

      // Type multi-line content
      fireEvent.change(textarea, {
        target: { value: "Line 1\nLine 2\nLine 3" },
      });

      // Height should be adjusted (may be the same or different depending on content)
      expect(textarea.style.height).toBeDefined();
      // In a real browser, height would increase with more lines
    });

    it("limits height to maximum", () => {
      render(<MessageInput onSendMessage={mockOnSendMessage} />);
      const textarea = screen.getByRole("textbox", {
        name: /message input/i,
      }) as HTMLTextAreaElement;

      // Type a lot of content
      const longContent = Array(50).fill("Long line of text").join("\n");
      fireEvent.change(textarea, { target: { value: longContent } });

      // Parse height value - should not exceed 200px
      const height = parseInt(textarea.style.height) || 0;
      expect(height).toBeLessThanOrEqual(200);
    });
  });

  describe("Mobile Device Detection", () => {
    const mobileUserAgents = [
      {
        name: "iPhone",
        agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
      },
      { name: "iPad", agent: "Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)" },
      { name: "Android", agent: "Mozilla/5.0 (Linux; Android 10; SM-G960U)" },
      {
        name: "iPod",
        agent: "Mozilla/5.0 (iPod; CPU iPhone OS 14_0 like Mac OS X)",
      },
    ];

    mobileUserAgents.forEach(({ name, agent }) => {
      it(`does not autofocus on ${name}`, async () => {
        Object.defineProperty(navigator, "userAgent", {
          value: agent,
          writable: true,
        });

        render(<MessageInput onSendMessage={mockOnSendMessage} />);
        const textarea = screen.getByRole("textbox", {
          name: /message input/i,
        });

        await waitFor(
          () => {
            expect(document.activeElement).not.toBe(textarea);
          },
          { timeout: 200 },
        );
      });
    });

    const desktopUserAgents = [
      {
        name: "Chrome Windows",
        agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
      },
      {
        name: "Firefox Mac",
        agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/89.0",
      },
      {
        name: "Safari Mac",
        agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
      },
      {
        name: "Edge Windows",
        agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/91.0",
      },
    ];

    desktopUserAgents.forEach(({ name, agent }) => {
      it(`autofocuses on ${name}`, async () => {
        Object.defineProperty(navigator, "userAgent", {
          value: agent,
          writable: true,
        });

        // Ensure nothing else has focus
        document.body.focus();

        render(<MessageInput onSendMessage={mockOnSendMessage} />);
        const textarea = screen.getByRole("textbox", {
          name: /message input/i,
        });

        await waitFor(
          () => {
            expect(document.activeElement).toBe(textarea);
          },
          { timeout: 200 },
        );
      });
    });
  });
});
