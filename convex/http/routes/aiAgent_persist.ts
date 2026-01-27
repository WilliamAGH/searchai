import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { safeConvexId } from "../../lib/validators";
import { isValidUuidV7 } from "../../lib/uuid";
import { corsResponse, serializeError } from "../utils";
import {
  parseJsonPayload,
  rateLimitExceededResponse,
  sanitizeTextInput,
} from "./aiAgent_utils";

export async function handleAgentPersist(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const probe = corsResponse("{}", 204, origin);
  if (probe.status === 403) return probe;

  const rateLimit = checkIpRateLimit(request, "/api/ai/agent/persist");
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit.resetAt, origin);
  }

  const payloadResult = await parseJsonPayload(
    request,
    origin,
    "AGENT PERSIST",
  );
  if (!payloadResult.ok) {
    return payloadResult.response;
  }
  const payload = payloadResult.payload;

  const message = sanitizeTextInput(payload.message, 10000) ?? "";
  const rawChatId = typeof payload.chatId === "string" ? payload.chatId : "";

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

  const chatId = safeConvexId<"chats">(rawChatId);
  if (!message.trim() || !chatId) {
    return corsResponse(
      JSON.stringify({ error: "chatId and message required" }),
      400,
      origin,
    );
  }

  try {
    // @ts-ignore - passing through to Convex action
    const result = await ctx.runAction(
      api.agents.orchestration.runAgentWorkflowAndPersist,
      {
        chatId,
        message,
        sessionId,
      },
    );
    return corsResponse(JSON.stringify(result), 200, origin);
  } catch (error) {
    const errorInfo = serializeError(error);
    return corsResponse(
      JSON.stringify({
        error: "Agent persistence failed",
        details: errorInfo.message,
        errorDetails: errorInfo,
      }),
      500,
      origin,
    );
  }
}
