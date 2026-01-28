import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { corsResponse, dlog, serializeError } from "../utils";
import {
  parseJsonPayload,
  rateLimitExceededResponse,
  sanitizeContextReferences,
  sanitizeTextInput,
} from "./aiAgent_utils";

export async function handleAgentRequest(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const probe = corsResponse("{}", 204, origin);
  if (probe.status === 403) return probe;

  const rateLimit = checkIpRateLimit(request, "/api/ai/agent");
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit.resetAt, origin);
  }

  const payloadResult = await parseJsonPayload(request, origin, "AGENT API");
  if (!payloadResult.ok) {
    return payloadResult.response;
  }
  const payload = payloadResult.payload;

  const message = sanitizeTextInput(payload.message, 10000);
  if (!message) {
    return corsResponse(
      JSON.stringify({ error: "Message must be a string" }),
      400,
      origin,
    );
  }
  if (!message.trim()) {
    return corsResponse(
      JSON.stringify({ error: "Message is required" }),
      400,
      origin,
    );
  }

  const conversationContext = sanitizeTextInput(
    payload.conversationContext,
    5000,
  );

  const contextReferences = sanitizeContextReferences(
    payload.contextReferences,
  );

  dlog("AGENT AI ENDPOINT CALLED:");
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
    dlog("Starting agent orchestration workflow...");

    const workflowResult = await ctx.runAction(
      api.agents.orchestration.orchestrateResearchWorkflow,
      {
        userQuery: message,
        conversationContext,
        contextReferences,
      },
    );

    dlog("[OK] AGENT WORKFLOW COMPLETE:", {
      workflowId: workflowResult.workflowId,
      totalDuration: workflowResult.metadata.totalDuration,
      answerLength: workflowResult.answer.answer.length,
      sourcesUsed: workflowResult.research.sourcesUsed.length,
      completeness: workflowResult.answer.answerCompleteness,
      confidence: workflowResult.answer.confidence,
    });

    const response = {
      answer: workflowResult.answer.answer,
      hasLimitations: workflowResult.answer.hasLimitations,
      limitations: workflowResult.answer.limitations,
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
      _debug:
        process.env.NODE_ENV === "development"
          ? {
              planning: workflowResult.planning,
              research: workflowResult.research,
            }
          : undefined,
    };

    dlog("AGENT RESPONSE:", JSON.stringify(response, null, 2));

    return corsResponse(JSON.stringify(response), 200, origin);
  } catch (error) {
    const errorInfo = serializeError(error);
    console.error("[ERROR] AGENT WORKFLOW FAILED:", {
      error: errorInfo.message,
      errorDetails: errorInfo,
      timestamp: new Date().toISOString(),
    });

    const errorResponse = {
      error: "Agent workflow failed",
      errorMessage: errorInfo.message,
      errorDetails: errorInfo,
      answer:
        "I apologize, but I encountered an error while processing your request. Please try again.",
      hasLimitations: true,
      limitations: "The AI processing system encountered an error.",
      sources: [],
      contextReferences: [],
      timestamp: new Date().toISOString(),
    };

    dlog(
      "[ERROR] AGENT ERROR RESPONSE:",
      JSON.stringify(errorResponse, null, 2),
    );

    return corsResponse(JSON.stringify(errorResponse), 500, origin);
  }
}
