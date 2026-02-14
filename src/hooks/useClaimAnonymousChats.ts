/**
 * Hook to claim anonymous chats when user signs in
 * Transfers ownership of session chats to the authenticated user
 */

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "@/lib/logger";

const SESSION_KEY = "researchly:anonymousSessionId";

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
            const result = await claimChats({ sessionId });
            // Successfully claimed anonymous chats

            // CRITICAL: Keep sessionId in localStorage for HTTP endpoint access
            // Reason: HTTP actions lack Convex auth context and validate via sessionId
            // The sessionId may be rotated during claim to prevent cross-user access.
            const nextSessionId =
              typeof result.newSessionId === "string"
                ? result.newSessionId
                : sessionId;
            if (nextSessionId && nextSessionId !== sessionId) {
              localStorage.setItem(SESSION_KEY, nextSessionId);
              globalThis.dispatchEvent(
                new Event("researchly:session-id-updated"),
              );
            }

            hasClaimedRef.current = true;
          } catch (error) {
            logger.error("Failed to claim anonymous chats", { error });
          }
        }
      }
    }

    void claim();
  }, [isAuthenticated, claimChats]);

  useEffect(() => {
    if (!isAuthenticated) {
      hasClaimedRef.current = false;
    }
  }, [isAuthenticated]);
}
