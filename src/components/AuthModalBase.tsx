/**
 * Shared base component for authentication modals (Sign In / Sign Up)
 * Extracts common structure: overlay, close button, keyboard handling, error extraction
 * Per DRY: Eliminates ~100 lines of duplication between SignInModal and SignUpModal
 */

import React, { useCallback, useRef, useEffect } from "react";

interface AuthModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  modalId: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional: adds focus trap for accessibility */
  enableFocusTrap?: boolean;
}

/**
 * Close button SVG icon - shared across auth modals
 */
export function CloseIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Close</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

/**
 * Extract error message from unknown error type.
 * Handles the common pattern used in auth modals.
 */
export function extractAuthErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "";
}

/**
 * Determine toast message based on error content
 */
export function getAuthToastMessage(
  errorMessage: string,
  defaultMessage: string,
): string {
  return errorMessage.includes("Invalid password")
    ? "Invalid password. Please try again."
    : defaultMessage;
}

/**
 * Base modal component for authentication dialogs
 */
export function AuthModalBase({
  isOpen,
  onClose,
  modalId,
  title,
  description,
  icon,
  children,
  footer,
  enableFocusTrap = false,
}: AuthModalBaseProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const handleOverlayKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    },
    [onClose],
  );

  // Focus management and optional focus trap
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (enableFocusTrap && e.key === "Tab") {
        const container = dialogRef.current;
        if (!container) return;
        const focusable = container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (active === first || !container.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    const node = dialogRef.current;
    node?.addEventListener("keydown", handleKeyDown);

    return () => {
      node?.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose, enableFocusTrap]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
    >
      {/* Backdrop - invisible button covering entire modal for click-outside dismissal */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
        onKeyDown={handleOverlayKeyDown}
        aria-label="Close modal by clicking backdrop"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6 border border-gray-200 dark:border-gray-700"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
            {icon}
          </div>
          <h2
            id={`${modalId}-title`}
            className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2"
          >
            {title}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">{description}</p>
        </div>

        {children}

        {footer && <div className="mt-6 text-center">{footer}</div>}
      </div>
    </div>
  );
}
