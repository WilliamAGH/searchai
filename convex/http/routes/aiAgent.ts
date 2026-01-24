"use node";

/**
 * Agent-based AI generation route handlers
 * Uses multi-stage agentic workflow: Planning → Research → Synthesis
 *
 * This replaces the legacy streaming approach with proper agent orchestration
 */

import { httpAction } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog } from "../utils";
import { corsPreflightResponse } from "../cors";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { streamConversationalWorkflow } from "../../agents/orchestration";

/**
 * Build a standardized rate limit exceeded response
 */
function rateLimitExceededResponse(
  resetAt: number,
  origin: string | null,
): Response {
  return corsResponse(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    }),
    429,
    origin,
  );
}
// Types come from the Node-free module so HTTP routes (and other V8 code) never import
// the helpers that depend on `node:crypto`.
import type { ResearchContextReference } from "../../agents/schema";

export function sanitizeContextReferences(
  input: unknown,
): ResearchContextReference[] | undefined {
  if (!Array.isArray(input)) return undefined;

  return input
    .slice(0, 12)
    .map((refRaw) => {
      if (typeof refRaw !== "object" || refRaw === null) return null;
      const ref = refRaw as Record<string, unknown>;
      const contextId = typeof ref.contextId === "string" ? ref.contextId : "";
      const type = ref.type;
      if (
        !contextId ||
        (type !== "search_result" &&
          type !== "scraped_page" &&
          type !== "research_summary")
      ) {
        return null;
      }

      const sanitized: ResearchContextReference = {
        contextId,
        type,
        timestamp:
          typeof ref.timestamp === "number" ? ref.timestamp : Date.now(),
      };

      if (typeof ref.url === "string") {
        sanitized.url = ref.url.slice(0, 2000);
      }
      if (typeof ref.title === "string") {
        sanitized.title = ref.title.slice(0, 500);
      }
      if (typeof ref.relevanceScore === "number") {
        sanitized.relevanceScore = ref.relevanceScore;
      }
      if (
        ref.metadata !== null &&
        ref.metadata !== undefined &&
        !(
          typeof ref.metadata === "object" &&
          Object.keys(ref.metadata).length === 0
        )
      ) {
        sanitized.metadata = ref.metadata;
      }

      return sanitized;
    })
    .filter((ref): ref is ResearchContextReference => !!ref);
}

/**
 * Register agent-based AI routes on the HTTP router
 */
export function registerAgentAIRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/ai/agent
  http.route({
    path: "/api/ai/agent",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      return corsPreflightResponse(request);
    }),
  });

  // Agent-based AI generation endpoint (non-streaming)
  http.route({
    path: "/api/ai/agent",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse("{}", 204, origin);
      if (probe.status === 403) return probe;

      const rateLimit = checkIpRateLimit(request, "/api/ai/agent");
      if (!rateLimit.allowed) {
        return rateLimitExceededResponse(rateLimit.resetAt, origin);
      }

      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
          origin,
        );
      }

      // Validate payload structure
      if (!rawPayload || typeof rawPayload !== "object") {
        return corsResponse(
          JSON.stringify({ error: "Invalid request payload" }),
          400,
          origin,
        );
      }
      const payload = rawPayload as Record<string, unknown>;

      // Validate and sanitize message (required field)
      if (!payload.message || typeof payload.message !== "string") {
        return corsResponse(
          JSON.stringify({ error: "Message must be a string" }),
          400,
          origin,
        );
      }

      // Remove control characters and null bytes, then limit length
      const message = String(payload.message)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, 10000);

      if (!message.trim()) {
        return corsResponse(
          JSON.stringify({ error: "Message is required" }),
          400,
          origin,
        );
      }

      // Optional conversation context (chat history summary)
      const conversationContext = payload.conversationContext
        ? String(payload.conversationContext)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
            .slice(0, 5000)
        : undefined;

      const contextReferences = sanitizeContextReferences(
        (payload as Record<string, unknown>).contextReferences,
      );

      dlog("🤖 AGENT AI ENDPOINT CALLED:");
      dlog("Message length:", message.length);
      dlog("Has context:", !!conversationContext);
      dlog("Context length:", conversationContext?.length || 0);
      dlog(
        "Context references provided:",
        contextReferences ? contextReferences.length : 0,
      );
      dlog("Environment Variables Available:");
      dlog(
        "- OPENROUTER_API_KEY:",
        process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
      );
      dlog("- LLM_MODEL:", process.env.LLM_MODEL || "default");

      try {
        // Execute the agent orchestration workflow
        dlog("🚀 Starting agent orchestration workflow...");

        const workflowResult = await ctx.runAction(
          api.agents.orchestration.orchestrateResearchWorkflow,
          {
            userQuery: message,
            conversationContext,
            contextReferences,
          },
        );

        dlog("✅ AGENT WORKFLOW COMPLETE:", {
          workflowId: workflowResult.workflowId,
          totalDuration: workflowResult.metadata.totalDuration,
          answerLength: workflowResult.answer.answer.length,
          sourcesUsed: workflowResult.research.sourcesUsed.length,
          completeness: workflowResult.answer.answerCompleteness,
          confidence: workflowResult.answer.confidence,
        });

        // Build response with full workflow data
        const response = {
          // Primary answer (what the user sees)
          answer: workflowResult.answer.answer,
          hasLimitations: workflowResult.answer.hasLimitations,
          limitations: workflowResult.answer.limitations,

          // Sources and context references
          sources: workflowResult.answer.sourcesUsed,
          contextReferences: workflowResult.research.sourcesUsed.map(
            (src: {
              url: string;
              title: string;
              contextId: string;
              type: "search_result" | "scraped_page";
              relevance: "high" | "medium" | "low";
            }) => ({
              contextId: src.contextId,
              type: src.type,
              url: src.url,
              title: src.title,
              timestamp: Date.now(),
              relevance: src.relevance,
            }),
          ),

          // Workflow metadata for debugging
          workflow: {
            id: workflowResult.workflowId,
            stages: {
              planning: {
                userIntent: workflowResult.planning.userIntent,
                queriesGenerated: workflowResult.planning.searchQueries.length,
                confidence: workflowResult.planning.confidenceLevel,
                duration: workflowResult.metadata.planningDuration,
              },
              research: {
                sourcesUsed: workflowResult.research.sourcesUsed.length,
                keyFindings: workflowResult.research.keyFindings.length,
                quality: workflowResult.research.researchQuality,
                duration: workflowResult.metadata.researchDuration,
              },
              synthesis: {
                completeness: workflowResult.answer.answerCompleteness,
                confidence: workflowResult.answer.confidence,
                duration: workflowResult.metadata.synthesisDuration,
              },
            },
            totalDuration: workflowResult.metadata.totalDuration,
            timestamp: workflowResult.metadata.timestamp,
          },

          // Full workflow data (optional, for advanced debugging)
          _debug:
            process.env.NODE_ENV === "development"
              ? {
                  planning: workflowResult.planning,
                  research: workflowResult.research,
                }
              : undefined,
        };

        dlog("📤 AGENT RESPONSE:", JSON.stringify(response, null, 2));

        return corsResponse(JSON.stringify(response), 200, origin);
      } catch (error) {
        console.error("💥 AGENT WORKFLOW FAILED:", {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : "No stack trace",
          timestamp: new Date().toISOString(),
        });

        // Fallback error response
        const errorResponse = {
          error: "Agent workflow failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error occurred",
          answer:
            "I apologize, but I encountered an error while processing your request. Please try again.",
          hasLimitations: true,
          limitations: "The AI processing system encountered an error.",
          sources: [],
          contextReferences: [],
          timestamp: new Date().toISOString(),
        };

        dlog(
          "❌ AGENT ERROR RESPONSE:",
          JSON.stringify(errorResponse, null, 2),
        );

        return corsResponse(JSON.stringify(errorResponse), 500, origin);
      }
    }),
  });

  // CORS preflight for streaming endpoint
  http.route({
    path: "/api/ai/agent/stream",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      return corsPreflightResponse(request);
    }),
  });

  // Agent-based AI generation endpoint (SSE streaming)
  http.route({
    path: "/api/ai/agent/stream",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse("{}", 204, origin);
      if (probe.status === 403) return probe;
      const allowedOrigin =
        probe.headers.get("Access-Control-Allow-Origin") || "*";

      const rateLimit = checkIpRateLimit(request, "/api/ai/agent/stream");
      if (!rateLimit.allowed) {
        return rateLimitExceededResponse(rateLimit.resetAt, origin);
      }

      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
          origin,
        );
      }

      if (!rawPayload || typeof rawPayload !== "object") {
        return corsResponse(
          JSON.stringify({ error: "Invalid request payload" }),
          400,
          origin,
        );
      }
      const payload = rawPayload as Record<string, unknown>;

      if (!payload.message || typeof payload.message !== "string") {
        return corsResponse(
          JSON.stringify({ error: "Message must be a string" }),
          400,
          origin,
        );
      }
      const message = String(payload.message)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, 10000);
      if (!payload.chatId || typeof payload.chatId !== "string") {
        return corsResponse(
          JSON.stringify({ error: "chatId is required" }),
          400,
          origin,
        );
      }

      const chatId = payload.chatId as Id<"chats">;
      const sessionId =
        typeof payload.sessionId === "string" ? payload.sessionId : undefined;
      const conversationContext = payload.conversationContext
        ? String(payload.conversationContext)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
            .slice(0, 5000)
        : undefined;
      const contextReferences = sanitizeContextReferences(
        payload.contextReferences,
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const sendEvent = (data: unknown) => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
              );
            } catch (error) {
              console.error("Failed to send SSE event:", error);
            }
          };

          try {
            const eventStream = streamConversationalWorkflow(ctx, {
              chatId,
              sessionId,
              userQuery: message,
              conversationContext,
              contextReferences,
            });

            for await (const event of eventStream) {
              sendEvent(event);
            }

            dlog("✅ STREAMING CONVERSATIONAL WORKFLOW COMPLETE");
          } catch (error) {
            console.error("💥 STREAMING WORKFLOW ERROR:", error);
            sendEvent({
              type: "error",
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now(),
            });
          } finally {
            try {
              controller.close();
            } catch {
              // Ignore double-close attempts
            }
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Headers": "Content-Type",
          Vary: "Origin",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }),
  });

  // CORS preflight for persist endpoint
  http.route({
    path: "/api/ai/agent/persist",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      return corsPreflightResponse(request);
    }),
  });

  // Agent-based AI generation with persistence (requires chatId)
  http.route({
    path: "/api/ai/agent/persist",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse("{}", 204, origin);
      if (probe.status === 403) return probe;

      const rateLimit = checkIpRateLimit(request, "/api/ai/agent/persist");
      if (!rateLimit.allowed) {
        return rateLimitExceededResponse(rateLimit.resetAt, origin);
      }

      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
          origin,
        );
      }

      const payload = rawPayload as Record<string, unknown>;
      const message =
        typeof payload.message === "string" ? payload.message : "";
      const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
      const sessionId =
        typeof payload.sessionId === "string" ? payload.sessionId : undefined;
      if (!message.trim() || !chatId) {
        return corsResponse(
          JSON.stringify({ error: "chatId and message required" }),
          400,
          origin,
        );
      }

      try {
        const result = await ctx.runAction(
          // @ts-ignore - passing through to Convex action
          api.agents.orchestration.runAgentWorkflowAndPersist as any,
          {
            chatId, // Convex will validate this is a valid Id
            message,
            sessionId,
          },
        );
        return corsResponse(JSON.stringify(result), 200, origin);
      } catch (error) {
        return corsResponse(
          JSON.stringify({
            error: "Agent persistence failed",
            details: error instanceof Error ? error.message : String(error),
          }),
          500,
          origin,
        );
      }
    }),
  });
}
