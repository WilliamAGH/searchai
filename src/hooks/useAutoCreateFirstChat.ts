/**
 * Hook to automatically create first chat if needed
 *
 * NOTE: Auto-creation is currently disabled to align with the policy of
 * "Create on First Message". We do not create empty chat sessions on page load.
 *
 * However, explicit user actions (like clicking "New Chat") may still trigger
 * immediate session creation to provide a fresh URL/context.
 */
export function useAutoCreateFirstChat(): { isCreatingInitialChat: false } {
  return {
    isCreatingInitialChat: false,
  };
}
