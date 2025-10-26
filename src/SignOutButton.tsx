"use client";
import React from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  const handleSignOut = React.useCallback(() => {
    void signOut();
  }, [signOut]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      onClick={handleSignOut}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
      title="Sign Out"
      aria-label="Sign Out"
      type="button"
    >
      <svg
        className="w-5 h-5 text-gray-700 dark:text-gray-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {/* Door */}
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        {/* Arrow out */}
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span className="sr-only">Sign Out</span>
    </button>
  );
}
