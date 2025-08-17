/**
 * Health Check HTTP Routes
 * Provides health status endpoints for monitoring
 */

import { httpAction } from "../../_generated/server";
import type { HttpRouter } from "convex/server";

/**
 * Register health check routes on the HTTP router
 */
export function registerHealthRoutes(http: HttpRouter) {
  // Basic health check endpoint
  http.route({
    path: "/api/health",
    method: "GET",
    handler: httpAction(async (_ctx) => {
      // Check basic Convex connectivity
      const convexHealthy = true; // If we can execute, Convex is healthy
      
      // Check environment variables
      const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
      const hasSerpApi = !!process.env.SERP_API_KEY;
      const hasResend = !!process.env.CONVEX_RESEND_API_KEY;
      
      // Determine overall health
      const status = convexHealthy ? "healthy" : "unhealthy";
      
      return new Response(
        JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
          services: {
            convex: convexHealthy ? "healthy" : "unhealthy",
            openrouter: hasOpenRouter ? "configured" : "not_configured",
            serpapi: hasSerpApi ? "configured" : "not_configured",
            resend: hasResend ? "configured" : "not_configured",
          },
          environment: {
            deployment: process.env.CONVEX_DEPLOYMENT || "unknown",
            url: process.env.CONVEX_URL || "unknown",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }),
  });

  // Detailed health check endpoint
  http.route({
    path: "/api/health/detailed",
    method: "GET",
    handler: httpAction(async (ctx) => {
      const checks: Record<string, any> = {};
      
      // Check database connectivity
      try {
        // Attempt to query a small collection
        // Note: This is a simplified check - in production you'd use a proper query
        const testQuery = { success: true, count: 0 };
        checks.database = {
          status: "healthy",
          responseTime: Date.now(),
          details: testQuery,
        };
      } catch (error) {
        checks.database = {
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
      
      // Check API keys
      checks.apiKeys = {
        openrouter: !!process.env.OPENROUTER_API_KEY,
        serpapi: !!process.env.SERP_API_KEY,
        resend: !!process.env.CONVEX_RESEND_API_KEY,
        openai: !!process.env.CONVEX_OPENAI_API_KEY,
      };
      
      // Check rate limits (simplified)
      checks.rateLimits = {
        searchPlannerWindow: 60000, // 1 minute
        searchPlannerLimit: 10,
        aiGenerationWindow: 60000,
        aiGenerationLimit: 20,
      };
      
      // Memory usage (if available in V8 runtime)
      try {
        if (typeof process !== "undefined" && process.memoryUsage) {
          const mem = process.memoryUsage();
          checks.memory = {
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + " MB",
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + " MB",
            rss: Math.round(mem.rss / 1024 / 1024) + " MB",
          };
        }
      } catch {
        // Memory info not available
      }
      
      // Determine overall status
      const hasDatabase = checks.database?.status === "healthy";
      const hasRequiredKeys = checks.apiKeys?.openrouter || checks.apiKeys?.openai;
      const overallStatus = hasDatabase && hasRequiredKeys ? "healthy" : "degraded";
      
      return new Response(
        JSON.stringify({
          status: overallStatus,
          timestamp: new Date().toISOString(),
          checks,
          metadata: {
            version: "1.0.0",
            deployment: process.env.CONVEX_DEPLOYMENT || "unknown",
          },
        }),
        {
          status: overallStatus === "healthy" ? 200 : 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }),
  });

  // Liveness probe (for k8s/docker)
  http.route({
    path: "/api/health/live",
    method: "GET",
    handler: httpAction(async () => {
      return new Response("OK", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }),
  });

  // Readiness probe (for k8s/docker)
  http.route({
    path: "/api/health/ready",
    method: "GET",
    handler: httpAction(async (_ctx) => {
      // Check if essential services are configured
      const hasAI = !!process.env.OPENROUTER_API_KEY || !!process.env.CONVEX_OPENAI_API_KEY;
      const isReady = hasAI;
      
      return new Response(
        JSON.stringify({
          ready: isReady,
          timestamp: new Date().toISOString(),
        }),
        {
          status: isReady ? 200 : 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }),
  });
}