/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useComponentProps } from "../../../src/hooks/useComponentProps";

function createArgs(
  overrides: Partial<Parameters<typeof useComponentProps>[0]> = {},
): Parameters<typeof useComponentProps>[0] {
  return {
    allChats: [],
    currentChatId: null,
    currentMessages: [],
    sidebarOpen: false,
    isMobile: false,
    isGenerating: false,
    searchProgress: null,
    isCreatingChat: false,
    handleSelectChat: vi.fn(),
    handleToggleSidebar: vi.fn(),
    handleNewChatButton: vi.fn(async () => {}),
    handleRequestDeleteChat: vi.fn(),
    handleRequestDeleteMessage: vi.fn(),
    handleMobileSidebarClose: vi.fn(),
    handleSendMessage: vi.fn(async () => {}),
    handleDraftChange: vi.fn(),
    setShowShareModal: vi.fn(),
    userHistory: [],
    ...overrides,
  };
}

describe("useComponentProps share behavior", () => {
  it("wires the share action on desktop", () => {
    const setShowShareModal = vi.fn();
    const args = createArgs({ isMobile: false, setShowShareModal });

    const { result } = renderHook(() => useComponentProps(args));
    const onShare = result.current.messageInputProps.onShare;

    expect(onShare).toBeTypeOf("function");
    onShare?.();

    expect(setShowShareModal).toHaveBeenCalledWith(true);
  });

  it("wires the share action on mobile", () => {
    const setShowShareModal = vi.fn();
    const args = createArgs({ isMobile: true, setShowShareModal });

    const { result } = renderHook(() => useComponentProps(args));
    const onShare = result.current.messageInputProps.onShare;

    expect(onShare).toBeTypeOf("function");
    onShare?.();

    expect(setShowShareModal).toHaveBeenCalledWith(true);
  });

  it("disables message input in read-only mode", () => {
    const args = createArgs({
      currentChatId: "chat_123",
      isReadOnly: true,
    });

    const { result } = renderHook(() => useComponentProps(args));

    expect(result.current.messageInputProps.disabled).toBe(true);
    expect(result.current.messageInputProps.placeholder).toBe(
      "Read-only shared chat",
    );
  });

  it("keeps message input enabled when writable", () => {
    const args = createArgs({
      currentChatId: "chat_123",
      isReadOnly: false,
    });

    const { result } = renderHook(() => useComponentProps(args));

    expect(result.current.messageInputProps.disabled).toBe(false);
    expect(result.current.messageInputProps.placeholder).toBe(
      "Type your message...",
    );
  });
});
