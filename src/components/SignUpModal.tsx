/**
 * Sign-up modal with email/password registration
 * - Creates new user accounts via Convex auth
 * - Provides switch to sign-in modal
 * - Dark mode optimized with proper button spacing
 */

import React, { useCallback, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignIn: () => void;
}

/**
 * Modal for user sign-up with email/password
 * @param isOpen - Controls modal visibility
 * @param onClose - Callback to close modal
 * @param onSwitchToSignIn - Callback to switch to sign-in modal
 */
export function SignUpModal({
  isOpen,
  onClose,
  onSwitchToSignIn,
}: SignUpModalProps) {
  const { signIn } = useAuthActions();
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  const handleOverlayKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);
      const form = e.currentTarget as HTMLFormElement;
      const formData = new FormData(form);
      formData.set("flow", "signUp");
      try {
        await signIn("password", formData);
        onClose();
      } catch (error: unknown) {
        const maybeMessage =
          typeof error === "object" &&
          error &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : "";
        const msg = maybeMessage.includes("Invalid password")
          ? "Invalid password. Please try again."
          : "Could not sign up. Please check your details.";
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [onClose, signIn],
  );

  // Focus management and simple focus trap
  React.useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Focus the email input first if available, otherwise the dialog
    const toFocus = emailInputRef.current || dialogRef.current;
    toFocus?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
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
          // Reverse tab
          if (active === first || !container.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Forward tab
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
      // Restore focus to the element that was focused before opening
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={handleOverlayKeyDown}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6 border border-gray-200 dark:border-gray-700 font-serif dark:font-mono"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <h2
            id="signup-modal-title"
            className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 dark:uppercase dark:tracking-wide"
          >
            Create your account
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Join SearchAI to start exploring
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 dark:uppercase dark:tracking-wider"
            >
              Email address
            </label>
            <input
              ref={emailInputRef}
              type="email"
              id="signup-email"
              name="email"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 dark:uppercase dark:tracking-wider"
            >
              Password
            </label>
            <input
              type="password"
              id="signup-password"
              name="password"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label
              htmlFor="signup-confirm-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 dark:uppercase dark:tracking-wider"
            >
              Confirm Password
            </label>
            <input
              type="password"
              id="signup-confirm-password"
              name="confirmPassword"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:uppercase dark:tracking-wider"
          >
            {submitting ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToSignIn}
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium dark:uppercase dark:tracking-wider"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
