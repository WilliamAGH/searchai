"use node";

import type { ActionCtx } from "../../_generated/server";
import { streamConversationalWorkflow } from "../../agents/orchestration";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { safeConvexId } from "../../lib/validators";
import { isValidUuidV7 } from "../../lib/uuid";
import { dlog, formatSseEvent, serializeError } from "../utils";
import {
  buildUnauthorizedOriginResponse,
  corsResponse,
  validateOrigin,
} from "../cors";
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
  const origin = validateOrigin(request.headers.get("Origin"));
  if (!origin) return buildUnauthorizedOriginResponse();

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
    return corsResponse({
      body: JSON.stringify({ error: "Message must be a string" }),
      status: 400,
      origin,
    });
  }

  if (!payload.chatId || typeof payload.chatId !== "string") {
    return corsResponse({
      body: JSON.stringify({ error: "chatId is required" }),
      status: 400,
      origin,
    });
  }

  const chatId = safeConvexId<"chats">(payload.chatId);
  if (!chatId) {
    return corsResponse({
      body: JSON.stringify({ error: "Invalid chatId" }),
      status: 400,
      origin,
    });
  }

  const sessionIdRaw =
    typeof payload.sessionId === "string" ? payload.sessionId : undefined;
  if (sessionIdRaw && !isValidUuidV7(sessionIdRaw)) {
    return corsResponse({
      body: JSON.stringify({ error: "Invalid sessionId format" }),
      status: 400,
      origin,
    });
  }
  const sessionId = sessionIdRaw;

  const conversationContext = sanitizeTextInput(
    payload.conversationContext,
    5000,
  );

  const webResearchSources = sanitizeWebResearchSources(
    payload.webResearchSources,
  );
  const includeDebugSourceContext = payload.includeDebugSourceContext === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamBroken = false;
      const sendEvent = (data: unknown) => {
        if (streamBroken) return;
        try {
          controller.enqueue(encoder.encode(formatSseEvent(data)));
        } catch (error) {
          console.error("Failed to send SSE event:", serializeError(error));
          streamBroken = true;
        }
      };

      try {
        const eventStream = streamConversationalWorkflow(ctx, {
          chatId,
          sessionId,
          userQuery: message,
          conversationContext,
          webResearchSources,
          includeDebugSourceContext,
        });

        for await (const event of eventStream) {
          if (streamBroken) {
            console.warn(
              "[CIRCUIT BREAKER] Breaking event loop: client disconnected",
            );
            break;
          }
          sendEvent(event);
        }

        dlog("[OK] STREAMING CONVERSATIONAL WORKFLOW COMPLETE");
      } catch (error) {
        const errorInfo = serializeError(error);
        console.error("[ERROR] STREAMING WORKFLOW ERROR:", errorInfo);
        sendEvent({
          type: "error",
          error: errorInfo.message,
          errorDetails:
            process.env.NODE_ENV === "development" ? errorInfo : undefined,
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
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}
