/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareModal } from "../../../src/components/ShareModal";

const SHARE_ID = "share-123";
const EXPORT_BASE = "https://example.com/api/chatTextMarkdown";
const EXPECTED_LLM_URL = `${EXPORT_BASE}?shareId=${SHARE_ID}&format=txt`;

describe("ShareModal LLM link behavior", () => {
  it("keeps the generated LLM URL visible after privacy syncs to shared", async () => {
    const onShare = vi.fn(async () => ({ shareId: SHARE_ID }));
    const onClose = vi.fn();

    const { rerender } = render(
      <ShareModal
        isOpen
        onClose={onClose}
        onShare={onShare}
        privacy="private"
        exportBase={EXPORT_BASE}
      />,
    );

    fireEvent.click(screen.getByLabelText("LLM Link"));
    fireEvent.click(screen.getByRole("button", { name: "Generate URL" }));

    await waitFor(() => {
      const linkInput = screen.getByLabelText<HTMLInputElement>("Link");
      expect(linkInput.value).toBe(EXPECTED_LLM_URL);
    });

    rerender(
      <ShareModal
        isOpen
        onClose={onClose}
        onShare={onShare}
        privacy="shared"
        exportBase={EXPORT_BASE}
      />,
    );

    await waitFor(() => {
      const linkInput = screen.getByLabelText<HTMLInputElement>("Link");
      expect(linkInput.value).toBe(EXPECTED_LLM_URL);
    });

    const linkInput = screen.getByLabelText<HTMLInputElement>("Link");
    expect(linkInput.placeholder).toBe("Generate LLM-friendly .txt link");
  });
});
