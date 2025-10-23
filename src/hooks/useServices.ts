/**
 * Hook to provide service instances
 *
 * NOTE: UnauthenticatedAIService has been removed. Streaming uses direct fetch
 * to /api/ai/agent/stream; this hook is retained for future DI if needed.
 */
export function useServices(_convexUrl?: string) {
  return {} as const;
}
