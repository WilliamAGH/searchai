import { useEffect, useRef } from "react";
import { logger } from "@/lib/logger";

type MessageInputFocusOptions = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
};

export function useMessageInputFocus({ textareaRef, disabled }: MessageInputFocusOptions) {
  // Autofocus once and manage focus on disabled changes
  useEffect(() => {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (error) {
      logger.warn("MessageInput focus with preventScroll failed", { error });
      try {
        el.focus();
      } catch (fallbackError) {
        logger.warn("MessageInput focus fallback failed", {
          error: fallbackError,
        });
      }
    }
  }, [disabled, textareaRef]);

  // Politely auto-focus the input once (desktop only, no modals)
  const hasAutoFocusedRef = useRef(false);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (disabled) return;
    if (hasAutoFocusedRef.current) return;

    // Skip on touch-centric devices to avoid popping the keyboard
    const isCoarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    // Avoid stealing focus if something else is active or a modal is open
    const hasModalOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
    const canStealFocus =
      document.activeElement === document.body &&
      document.visibilityState === "visible" &&
      !isCoarse &&
      !hasModalOpen;

    // Only focus if the element is visible and enabled
    const isVisible = el.offsetParent !== null && !el.disabled;
    if (!canStealFocus || !isVisible) return;

    const raf = requestAnimationFrame(() => {
      try {
        // Prevent scroll jumps on focus
        el.focus({ preventScroll: true });
      } catch (error) {
        logger.warn("MessageInput auto-focus with preventScroll failed", {
          error,
        });
        el.focus();
      }
    });

    hasAutoFocusedRef.current = true;
    return () => cancelAnimationFrame(raf);
  }, [disabled, textareaRef]);
}
