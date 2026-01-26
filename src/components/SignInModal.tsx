/**
 * Sign-in modal with email/password auth
 * - Handles user authentication via Convex auth
 * - Provides switch to sign-up modal
 * - Uses shared AuthModalBase for consistent UX (DRY)
 */

import React, { useCallback, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import {
  AuthModalBase,
  extractAuthErrorMessage,
  getAuthToastMessage,
} from "@/components/AuthModalBase";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getResultErrorMessage = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  const error = value.error;
  if (typeof error === "string") {
    return error;
  }
  if (error !== undefined) {
    return String(error);
  }
  return null;
};

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignUp: () => void;
}

/** Search icon for sign-in modal header */
function SearchIcon() {
  return (
    <svg
      className="w-8 h-8 text-white"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Search</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);
      const formData = new FormData(e.currentTarget);
      formData.set("flow", "signIn");
      try {
        const result = await signIn("password", formData);
        const errorMessage = getResultErrorMessage(result);
        if (errorMessage) {
          toast.error(
            getAuthToastMessage(
              errorMessage,
              "Could not sign in. Please check your credentials.",
            ),
          );
        } else {
          onClose();
        }
      } catch (error: unknown) {
        const maybeMessage = extractAuthErrorMessage(error);
        toast.error(
          getAuthToastMessage(
            maybeMessage,
            "Could not sign in. Please check your credentials.",
          ),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [onClose, signIn],
  );

  return (
    <AuthModalBase
      isOpen={isOpen}
      onClose={onClose}
      modalId="signin-modal"
      title="Sign In to SearchAI"
      description="Access your saved conversations and continue your search journey."
      icon={<SearchIcon />}
      footer={
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Free forever - No credit card required
        </p>
      }
    >
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
      </div>
    </AuthModalBase>
  );
}
