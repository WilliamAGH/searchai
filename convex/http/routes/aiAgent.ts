/**
 * Agent-based AI generation route handlers
 * Uses multi-stage agentic workflow: Planning → Research → Synthesis
 *
 * This replaces the legacy streaming approach with proper agent orchestration
 */

import { httpAction } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog } from "../utils";
import { corsPreflightResponse } from "../cors";

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

  // Agent-based AI generation endpoint
  http.route({
    path: "/api/ai/agent",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse("{}", 204, origin);
      if (probe.status === 403) return probe;

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

      dlog("🤖 AGENT AI ENDPOINT CALLED:");
      dlog("Message length:", message.length);
      dlog("Has context:", !!conversationContext);
      dlog("Context length:", conversationContext?.length || 0);
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

  // STREAMING agent-based AI generation endpoint
  http.route({
    path: "/api/ai/agent/stream",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse("{}", 204, origin);
      if (probe.status === 403) return probe;

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

      dlog("🌊 STREAMING AGENT ENDPOINT CALLED:");
      dlog("Message length:", message.length);
      dlog("Has context:", !!conversationContext);

      try {
        // Create ReadableStream for SSE
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();

            try {
              dlog("🚀 Starting streaming orchestration...");

              // Get the async generator from streaming orchestration
              const eventGenerator = await ctx.runAction(
                api.agents.orchestration.orchestrateResearchWorkflowStreaming,
                {
                  userQuery: message,
                  conversationContext,
                },
              );

              dlog("📡 Consuming event stream...");

              // Consume events and emit as SSE
              for await (const event of eventGenerator) {
                const sseData = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(sseData));
                dlog("📤 Sent event:", event.type);
              }

              // Send done signal
              dlog("✅ Stream complete, sending [DONE]");
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error) {
              console.error("💥 STREAMING ERROR:", {
                error: error instanceof Error ? error.message : "Unknown error",
                stack: error instanceof Error ? error.stack : "No stack trace",
              });

              const errorEvent = {
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`),
              );
              controller.close();
            }
          },
        });

        // Return SSE response with CORS headers
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no", // Disable nginx buffering
            "Access-Control-Allow-Origin": origin || "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      } catch (error) {
        console.error("💥 STREAMING SETUP FAILED:", {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : "No stack trace",
        });

        return corsResponse(
          JSON.stringify({
            error: "Streaming setup failed",
            details: error instanceof Error ? error.message : String(error),
          }),
          500,
          origin,
        );
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

  // Agent-based AI generation with persistence (requires chatId)
  http.route({
    path: "/api/ai/agent/persist",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
        );
      }

      const payload = rawPayload as Record<string, unknown>;
      const message =
        typeof payload.message === "string" ? payload.message : "";
      const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
      if (!message.trim() || !chatId) {
        return corsResponse(
          JSON.stringify({ error: "chatId and message required" }),
          400,
        );
      }

      try {
        const result = await ctx.runAction(
          // @ts-ignore - passing through to Convex action
          api.agents.orchestration.runAgentWorkflowAndPersist as any,
          {
            chatId, // Convex will validate this is a valid Id
            message,
          },
        );
        return corsResponse(JSON.stringify(result));
      } catch (error) {
        return corsResponse(
          JSON.stringify({
            error: "Agent persistence failed",
            details: error instanceof Error ? error.message : String(error),
          }),
          500,
        );
      }
    }),
  });
}
