/**
 * Sign-up modal with email/password registration
 * - Creates new user accounts via Convex auth
 * - Provides switch to sign-in modal
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

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignIn: () => void;
}

/** User add icon for sign-up modal header */
function UserAddIcon() {
  return (
    <svg
      className="w-6 h-6 text-white"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Create Account</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
      />
    </svg>
  );
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);
      const formData = new FormData(e.currentTarget);
      formData.set("flow", "signUp");
      try {
        await signIn("password", formData);
        onClose();
      } catch (error: unknown) {
        const maybeMessage = extractAuthErrorMessage(error);
        toast.error(
          getAuthToastMessage(
            maybeMessage,
            "Could not sign up. Please check your details.",
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
      modalId="signup-modal"
      title="Create your account"
      description="Join SearchAI to start exploring"
      icon={<UserAddIcon />}
      enableFocusTrap
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="signup-email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Email address
          </label>
          <input
            type="email"
            id="signup-email"
            name="email"
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label
            htmlFor="signup-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
            autoComplete="new-password"
          />
        </div>

        <div>
          <label
            htmlFor="signup-confirm-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold dark:bg-emerald-600 dark:hover:bg-emerald-700"
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
            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </AuthModalBase>
  );
}
