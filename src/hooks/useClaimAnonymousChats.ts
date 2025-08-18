/**
 * Hook to claim anonymous chats when user signs in
 * Transfers ownership of session chats to the authenticated user
 */

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ANON_SESSION_KEY } from "../lib/constants/session";
import { useInputActivity } from "../contexts/InputActivityContext";

export function useClaimAnonymousChats() {
  const { isAuthenticated } = useConvexAuth();
  const claimChats = useMutation(api.chats.claim.claimAnonymousChats);
  const hasClaimedRef = useRef(false);
  const { whenInputInactive } = useInputActivity();

  useEffect(() => {
    async function claim() {
      // Only run once when user becomes authenticated
      if (isAuthenticated && !hasClaimedRef.current) {
        const sessionId = localStorage.getItem(ANON_SESSION_KEY);

        if (sessionId) {
          // CRITICAL: Defer claiming until user is not typing
          // This prevents localStorage modifications during active input
          whenInputInactive(async () => {
            try {
              await claimChats({ sessionId });
              // Successfully claimed anonymous chats

              // Remove session ID after successful claim
              localStorage.removeItem(ANON_SESSION_KEY);
              hasClaimedRef.current = true;
            } catch {
              // Failed to claim anonymous chats - will retry on next login
            }
          });
        }
      }
    }

    claim();
  }, [isAuthenticated, claimChats, whenInputInactive]);
}
