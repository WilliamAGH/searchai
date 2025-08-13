import { useMemo } from "react";
import { UnauthenticatedAIService } from "../lib/services/UnauthenticatedAIService";

/**
 * Hook to provide service instances
 */
export function useServices(convexUrl?: string) {
  const aiService = useMemo(() => {
    const urlStr = (convexUrl ?? import.meta.env.VITE_CONVEX_URL ?? "").trim();
    if (!urlStr) {
      throw new Error(
        "[useServices] Missing Convex URL (VITE_CONVEX_URL). Cannot initialize AI service.",
      );
    }
    try {
      // Validate URL format early to fail fast on misconfiguration
      const validatedUrl = new URL(urlStr);
      // Use the validated URL to ensure it was properly parsed
      if (!validatedUrl.href) {
        throw new Error("Invalid URL");
      }
    } catch {
      throw new Error(
        `[useServices] Invalid Convex URL format: ${urlStr}. Please set a valid VITE_CONVEX_URL.`,
      );
    }
    return new UnauthenticatedAIService(urlStr);
  }, [convexUrl]);

  return {
    aiService,
  };
}
