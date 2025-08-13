import { useMemo } from "react";
import { UnauthenticatedAIService } from "../lib/services/UnauthenticatedAIService";
import { ChatCreationService } from "../lib/services/ChatCreationService";

/**
 * Hook to provide service instances
 */
export function useServices(convexUrl?: string) {
  const aiService = useMemo(() => {
    const url = convexUrl || import.meta.env.VITE_CONVEX_URL || "";
    return new UnauthenticatedAIService(url);
  }, [convexUrl]);

  const chatCreationService = useMemo(() => {
    return new ChatCreationService();
  }, []);

  return {
    aiService,
    chatCreationService,
  };
}
