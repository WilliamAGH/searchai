import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { dlog, serializeError } from "../utils";
import { corsResponse } from "../cors";
import {
  parseJsonPayload,
  rateLimitExceededResponse,
  sanitizeWebResearchSources,
  sanitizeTextInput,
} from "./aiAgent_utils";
import { RELEVANCE_SCORES } from "../../lib/constants/cache";

export async function handleAgentRequest(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const probe = corsResponse({ body: "{}", status: 204, origin });
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
  if (message === undefined) {
    return corsResponse({
      body: JSON.stringify({ error: "Message must be a string" }),
      status: 400,
      origin,
    });
  }
  if (!message.trim()) {
    return corsResponse({
      body: JSON.stringify({ error: "Message is required" }),
      status: 400,
      origin,
    });
  }

  const conversationContext = sanitizeTextInput(
    payload.conversationContext,
    5000,
  );

  const webResearchSources = sanitizeWebResearchSources(
    payload.webResearchSources,
  );

  dlog("AGENT AI ENDPOINT CALLED:");
  dlog("Message length:", message.length);
  dlog("Has context:", !!conversationContext);
  dlog("Context length:", conversationContext?.length || 0);
  dlog("Web research sources provided:", webResearchSources?.length ?? 0);
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
        webResearchSources,
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
      webResearchSources: workflowResult.research.sourcesUsed.map(
        (src: {
          url: string;
          title: string;
          contextId: string;
          type: "search_result" | "scraped_page" | "research_summary";
          relevance: "high" | "medium" | "low";
        }) => ({
          contextId: src.contextId,
          type: src.type,
          url: src.url,
          title: src.title,
          timestamp: Date.now(),
          relevanceScore:
            src.relevance === "high"
              ? RELEVANCE_SCORES.HIGH_LABEL
              : src.relevance === "medium"
                ? RELEVANCE_SCORES.MEDIUM_LABEL
                : RELEVANCE_SCORES.LOW_LABEL,
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

    return corsResponse({
      body: JSON.stringify(response),
      status: 200,
      origin,
    });
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
      // Only include error details in development to avoid leaking stack traces
      errorDetails:
        process.env.NODE_ENV === "development" ? errorInfo : undefined,
      answer:
        "I apologize, but I encountered an error while processing your request. Please try again.",
      hasLimitations: true,
      limitations: "The AI processing system encountered an error.",
      webResearchSources: [],
      timestamp: new Date().toISOString(),
    };

    dlog(
      "[ERROR] AGENT ERROR RESPONSE:",
      JSON.stringify(errorResponse, null, 2),
    );

    return corsResponse({
      body: JSON.stringify(errorResponse),
      status: 500,
      origin,
    });
  }
}
