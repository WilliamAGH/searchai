/**
 * Sign-up modal with email/password registration
 * - Creates new user accounts via Convex auth
 * - Provides switch to sign-in modal
 * - Dark mode optimized with proper button spacing
 */

import React from 'react';
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
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
export function SignUpModal({ isOpen, onClose, onSwitchToSignIn }: SignUpModalProps) {
  const { signIn } = useAuthActions();
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  if (!isOpen) return null;

  // Focus management and simple focus trap
  React.useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Focus the email input first if available, otherwise the dialog
    const toFocus = emailInputRef.current || dialogRef.current;
    toFocus?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const container = dialogRef.current;
        if (!container) return;
        const focusable = container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
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
    node?.addEventListener('keydown', handleKeyDown);

    return () => {
      node?.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that was focused before opening
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
      aria-describedby="signup-modal-description"
      tabIndex={-1}
      ref={dialogRef}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close modal"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="text-center mb-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 id="signup-modal-title" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Create a SearchAI Account
          </h2>
          <p id="signup-modal-description" className="text-gray-600 dark:text-gray-400">
            Create a free account to continue your conversation and save your chat history.
          </p>
        </div>
        
        <div className="w-full">
          <form
            className="flex flex-col gap-4"
            aria-busy={submitting}
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              const form = e.currentTarget as HTMLFormElement;
              const formData = new FormData(form);
              formData.set("flow", "signUp");
              try {
                await signIn("password", formData);
                onClose();
              } catch (error: unknown) {
                const message =
                  typeof error === "object" && error && "message" in error && typeof (error as any).message === "string"
                    ? (error as any).message as string
                    : "";
                const msg = message.includes("Invalid password")
                  ? "Invalid password. Please try again."
                  : "Could not sign up. Please check your details.";
                toast.error(msg);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <label htmlFor="signup-email" className="sr-only">Email</label>
            <input
              id="signup-email"
              className="w-full px-4 py-3 rounded-lg bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow text-base dark:text-white"
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
              ref={emailInputRef}
              required
            />
            <label htmlFor="signup-password" className="sr-only">Password</label>
            <input
              id="signup-password"
              className="w-full px-4 py-3 rounded-lg bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow text-base dark:text-white"
              type="password"
              name="password"
              placeholder="Password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900" type="submit" disabled={submitting}>
              Sign up
            </button>
            <div className="text-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Already have an account?{" "}
              </span>
              <button
                type="button"
                className="text-primary hover:text-primary/80 hover:underline font-medium cursor-pointer dark:text-white"
                onClick={onSwitchToSignIn}
              >
                Sign in instead
              </button>
            </div>
          </form>
          
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
