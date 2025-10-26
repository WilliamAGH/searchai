/**
 * Hook to claim anonymous chats when user signs in
 * Transfers ownership of session chats to the authenticated user
 */

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const SESSION_KEY = "searchai:anonymousSessionId";

export function useClaimAnonymousChats() {
  const { isAuthenticated } = useConvexAuth();
  const claimChats = useMutation(api.chats.claim.claimAnonymousChats);
  const hasClaimedRef = useRef(false);

  useEffect(() => {
    async function claim() {
      // Only run once when user becomes authenticated
      if (isAuthenticated && !hasClaimedRef.current) {
        const sessionId = localStorage.getItem(SESSION_KEY);

        if (sessionId) {
          try {
            await claimChats({ sessionId });
            // Successfully claimed anonymous chats

            // CRITICAL: Keep sessionId in localStorage for HTTP endpoint access
            // Reason: HTTP actions lack Convex auth context and validate via sessionId
            // The sessionId is now associated with both anonymous chats (now claimed)
            // and will be used for future HTTP requests from this authenticated user
            // Do NOT remove: localStorage.removeItem(SESSION_KEY);

            hasClaimedRef.current = true;
          } catch {
            // Failed to claim anonymous chats - will retry on next login
          }
        }
      }
    }

    claim();
  }, [isAuthenticated, claimChats]);
}
