"use node";

import type { ActionCtx } from "../../_generated/server";
import { streamConversationalWorkflow } from "../../agents/orchestration";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { safeConvexId } from "../../lib/validators";
import { isValidUuidV7 } from "../../lib/uuid";
import { corsResponse, dlog, formatSseEvent, serializeError } from "../utils";
import {
  parseJsonPayload,
  rateLimitExceededResponse,
  sanitizeWebResearchSources,
  sanitizeTextInput,
} from "./aiAgent_utils";

export async function handleAgentStream(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const probe = corsResponse("{}", 204, origin);
  if (probe.status === 403) return probe;
  const allowedOrigin = probe.headers.get("Access-Control-Allow-Origin") || "*";

  const rateLimit = checkIpRateLimit(request, "/api/ai/agent/stream");
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit.resetAt, origin);
  }

  const payloadResult = await parseJsonPayload(request, origin, "AGENT STREAM");
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

  if (!payload.chatId || typeof payload.chatId !== "string") {
    return corsResponse(
      JSON.stringify({ error: "chatId is required" }),
      400,
      origin,
    );
  }

  const chatId = safeConvexId<"chats">(payload.chatId);
  if (!chatId) {
    return corsResponse(
      JSON.stringify({ error: "Invalid chatId" }),
      400,
      origin,
    );
  }

  const sessionIdRaw =
    typeof payload.sessionId === "string" ? payload.sessionId : undefined;
  if (sessionIdRaw && !isValidUuidV7(sessionIdRaw)) {
    return corsResponse(
      JSON.stringify({ error: "Invalid sessionId format" }),
      400,
      origin,
    );
  }
  const sessionId = sessionIdRaw;

  const conversationContext = sanitizeTextInput(
    payload.conversationContext,
    5000,
  );

  const webResearchSources = sanitizeWebResearchSources(
    payload.webResearchSources,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(data)));
        } catch (error) {
          console.error("Failed to send SSE event:", serializeError(error));
        }
      };

      try {
        const eventStream = streamConversationalWorkflow(ctx, {
          chatId,
          sessionId,
          userQuery: message,
          conversationContext,
          webResearchSources,
        });

        for await (const event of eventStream) {
          sendEvent(event);
        }

        dlog("[OK] STREAMING CONVERSATIONAL WORKFLOW COMPLETE");
      } catch (error) {
        console.error(
          "[ERROR] STREAMING WORKFLOW ERROR:",
          serializeError(error),
        );
        sendEvent({
          type: "error",
          error: serializeError(error).message,
          errorDetails: serializeError(error),
          timestamp: Date.now(),
        });
      } finally {
        try {
          controller.close();
        } catch (closeError) {
          console.error("Failed to close SSE controller", {
            error: serializeError(closeError),
          });
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
}
