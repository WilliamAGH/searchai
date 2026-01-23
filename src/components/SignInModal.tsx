/**
 * Sign-in modal with email/password auth
 * - Handles user authentication via Convex auth
 * - Provides switch to sign-up modal
 * - Dark mode and accessibility optimized
 */

import React, { useCallback, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignUp: () => void;
}

/**
 * Modal for user sign-in with email/password
 * @param isOpen - Controls modal visibility
 * @param onClose - Callback to close modal
 * @param onSwitchToSignUp - Callback to switch to sign-up modal
 */
export function SignInModal({
  isOpen,
  onClose,
  onSwitchToSignUp,
}: SignInModalProps) {
  const { signIn } = useAuthActions();
  const [submitting, setSubmitting] = useState(false);

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
      const formData = new FormData(e.target as HTMLFormElement);
      formData.set("flow", "signIn");
      try {
        const result = await signIn("password", formData, {
          redirect: false,
        } as unknown as Record<string, unknown>);
        if ((result as { error?: unknown })?.error) {
          const msg = String((result as { error?: unknown }).error || "");
          const toastTitle = msg.includes("Invalid password")
            ? "Invalid password. Please try again."
            : "Could not sign in. Please check your credentials.";
          toast.error(toastTitle);
        } else {
          onClose();
        }
      } catch (error: unknown) {
        const maybeMessage =
          typeof error === "object" &&
          error &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : "";
        const toastTitle = maybeMessage.includes("Invalid password")
          ? "Invalid password. Please try again."
          : "Could not sign in. Please check your credentials.";
        toast.error(toastTitle);
      } finally {
        setSubmitting(false);
      }
    },
    [onClose, signIn],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={handleOverlayKeyDown}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close sign in modal"
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
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h2
            id="signin-modal-title"
            className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2"
          >
            Sign In to SearchAI
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Access your saved conversations and continue your search journey.
          </p>
        </div>

        <div className="w-full">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <input
              className="w-full px-4 py-3 rounded-lg bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow text-base dark:text-white"
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
              required
            />
            <input
              className="w-full px-4 py-3 rounded-lg bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow text-base dark:text-white"
              type="password"
              name="password"
              placeholder="Password"
              autoComplete="current-password"
              required
            />
            <button
              className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              type="submit"
              disabled={submitting}
            >
              Sign in
            </button>
            <div className="text-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Don't have an account?{" "}
              </span>
              <button
                type="button"
                className="text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer dark:text-white"
                onClick={onSwitchToSignUp}
              >
                Sign up instead
              </button>
            </div>
          </form>
          {null}
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Free forever • No credit card required
          </p>
        </div>
      </div>
    </div>
  );
}
