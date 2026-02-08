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
});
