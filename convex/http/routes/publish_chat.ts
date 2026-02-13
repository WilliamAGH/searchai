import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { isValidUuidV7 } from "../../lib/uuid";
import { isRecord } from "../../lib/validators";
import { serializeError } from "../utils";
import {
  buildUnauthorizedOriginResponse,
  corsResponse,
  validateOrigin,
} from "../cors";
import {
  rateLimitExceededResponse,
  sanitizeWebResearchSources,
} from "./aiAgent_utils";

const TITLE_MAX_LENGTH = 200;
const MAX_MESSAGES = 100;
const CONTENT_MAX_LENGTH = 50_000;

type ParsedPublishPayload = {
  title: string;
  privacy: "shared" | "public";
  shareId: string | undefined;
  publicId: string | undefined;
  messages: Array<{
    role: "user" | "assistant";
    content: string | undefined;
    webResearchSources: ReturnType<typeof sanitizeWebResearchSources>;
    timestamp: number | undefined;
  }>;
};

function parsePublishPayload(
  raw: Record<string, unknown>,
): ParsedPublishPayload {
  const rawTitle = typeof raw.title === "string" ? raw.title : "Shared Chat";
  return {
    title: rawTitle.trim().slice(0, TITLE_MAX_LENGTH),
    privacy: raw.privacy === "public" ? "public" : "shared",
    shareId:
      typeof raw.shareId === "string" && isValidUuidV7(raw.shareId)
        ? raw.shareId
        : undefined,
    publicId:
      typeof raw.publicId === "string" && isValidUuidV7(raw.publicId)
        ? raw.publicId
        : undefined,
    messages: parsePublishMessages(raw.messages),
  };
}

function parsePublishMessages(raw: unknown): ParsedPublishPayload["messages"] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_MESSAGES).map((m: unknown) => {
    const msg = isRecord(m) ? m : {};
    return {
      role: msg.role === "user" ? "user" : "assistant",
      content:
        typeof msg.content === "string"
          ? msg.content.slice(0, CONTENT_MAX_LENGTH)
          : undefined,
      webResearchSources: sanitizeWebResearchSources(msg.webResearchSources),
      timestamp:
        typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
          ? Math.floor(msg.timestamp)
          : undefined,
    };
  });
}

function buildShareUrls(
  result: { shareId: string; publicId: string },
  allowOrigin: string,
  siteUrl: string,
) {
  const baseUrl =
    allowOrigin !== "*" && allowOrigin !== "null" ? allowOrigin : siteUrl;
  // Use the branded base URL for export links so they point to
  // researchly.bot/api/exportChat instead of the raw Convex deployment.
  // The /api/* proxy (server.mjs) forwards to Convex transparently.
  const exportBase = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/api/exportChat`
    : `/api/exportChat`;
  return {
    shareUrl: `${baseUrl}/s/${result.shareId}`,
    publicUrl: `${baseUrl}/p/${result.publicId}`,
    llmTxtUrl: `${exportBase}?shareId=${encodeURIComponent(result.shareId)}&format=txt`,
  };
}

/** Handle authenticated chat publication with CORS origin validation */
export async function handlePublishChat(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowOrigin = validateOrigin(origin);
  if (!allowOrigin) return buildUnauthorizedOriginResponse();

  const rateLimit = checkIpRateLimit(request, "/api/publish_chat", 5, 60_000);
  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit.resetAt, allowOrigin);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    const errorInfo = serializeError(error);
    console.error("[ERROR] PUBLISH INVALID JSON:", errorInfo);
    return corsResponse({
      body: JSON.stringify({
        error: "Invalid JSON body",
        ...(process.env.NODE_ENV === "development"
          ? { errorDetails: errorInfo }
          : {}),
      }),
      status: 400,
      origin,
    });
  }

  const record = isRecord(rawPayload) ? rawPayload : null;
  if (!record) {
    return corsResponse({
      body: JSON.stringify({ error: "Invalid request payload" }),
      status: 400,
      origin,
    });
  }

  const payload = parsePublishPayload(record);

  try {
    const result = await ctx.runMutation(
      // @ts-ignore - TS2589: Known Convex limitation with complex type inference
      api.chats.publishAnonymousChat,
      payload,
    );
    const urls = buildShareUrls(
      result,
      allowOrigin,
      process.env.SITE_URL || "",
    );
    return corsResponse({
      body: JSON.stringify({ ...result, ...urls }),
      status: 200,
      origin,
    });
  } catch (error: unknown) {
    const errorInfo = serializeError(error);
    console.error("[ERROR] PUBLISH CHAT:", errorInfo);
    return corsResponse({
      body: JSON.stringify({
        error: errorInfo.message,
        ...(process.env.NODE_ENV === "development"
          ? { errorDetails: errorInfo }
          : {}),
      }),
      status: 500,
      origin,
    });
  }
}
