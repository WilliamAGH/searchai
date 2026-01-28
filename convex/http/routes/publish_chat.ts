import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { serializeError } from "../utils";
import { buildCorsJsonResponse, getAllowedOrigin } from "./publish_cors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handlePublishChat(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    console.error("[ERROR] PUBLISH INVALID JSON:", serializeError(error));
    return buildCorsJsonResponse(
      request,
      { error: "Invalid JSON body", errorDetails: serializeError(error) },
      400,
    );
  }

  const payload = isRecord(rawPayload) ? rawPayload : null;
  if (!payload) {
    return buildCorsJsonResponse(
      request,
      { error: "Invalid request payload" },
      400,
    );
  }

  const rawTitle =
    typeof payload.title === "string" ? payload.title : "Shared Chat";
  const title = rawTitle.trim().slice(0, 200);
  const privacy = payload.privacy === "public" ? "public" : "shared";
  const shareId = payload.shareId
    ? String(payload.shareId).slice(0, 100)
    : undefined;
  const publicId = payload.publicId
    ? String(payload.publicId).slice(0, 100)
    : undefined;

  const messages = Array.isArray(payload.messages)
    ? payload.messages.slice(0, 100).map((m: unknown) => {
        const msg = isRecord(m) ? m : {};
        const role: "user" | "assistant" =
          msg.role === "user" ? "user" : "assistant";
        return {
          role,
          content: msg.content
            ? String(msg.content).slice(0, 50000)
            : undefined,
          searchResults: Array.isArray(msg.searchResults)
            ? msg.searchResults.slice(0, 20).map((r: unknown) => {
                const result = isRecord(r) ? r : {};
                return {
                  title: String(result.title || "").slice(0, 200),
                  url: String(result.url || "").slice(0, 2048),
                  snippet: String(result.snippet || "").slice(0, 500),
                  relevanceScore:
                    typeof result.relevanceScore === "number"
                      ? Math.max(0, Math.min(1, result.relevanceScore))
                      : 0.5,
                };
              })
            : undefined,
          sources: Array.isArray(msg.sources)
            ? msg.sources
                .slice(0, 20)
                .filter((s: unknown) => typeof s === "string")
                .map((s: unknown) => String(s).slice(0, 2048))
            : undefined,
          timestamp:
            typeof msg.timestamp === "number" && isFinite(msg.timestamp)
              ? Math.floor(msg.timestamp)
              : undefined,
        };
      })
    : [];

  try {
    // Work around TS2589: Known Convex limitation with complex type inference
    // @ts-ignore - Deep type instantiation error
    const result = await ctx.runMutation(api.chats.publishAnonymousChat, {
      title,
      privacy,
      shareId,
      publicId,
      messages,
    });
    const origin = request.headers.get("Origin");
    const allowOrigin = getAllowedOrigin(origin);
    const baseUrl =
      allowOrigin !== "*" && allowOrigin !== "null"
        ? allowOrigin
        : process.env.SITE_URL || "";
    const shareUrl = `${baseUrl}/s/${result.shareId}`;
    const publicUrl = `${baseUrl}/p/${result.publicId}`;
    const convexBase = (process.env.CONVEX_SITE_URL || "").replace(/\/+$/, "");
    const exportBase = convexBase
      ? `${convexBase}/api/exportChat`
      : `/api/exportChat`;
    const llmTxtUrl = `${exportBase}?shareId=${encodeURIComponent(result.shareId)}&format=txt`;

    return buildCorsJsonResponse(
      request,
      { ...result, shareUrl, publicUrl, llmTxtUrl },
      200,
    );
  } catch (error: unknown) {
    const errorInfo = serializeError(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return buildCorsJsonResponse(
      request,
      { error: errorMessage, errorDetails: errorInfo },
      500,
    );
  }
}
