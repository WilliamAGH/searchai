/**
 * Lightweight OG metadata endpoint for server-side meta tag injection.
 * Returns only chat-level fields (title, description, privacy, robots) —
 * no messages loaded, keeping latency minimal for the proxy server.
 *
 * Route: GET /api/ogMeta?shareId=xxx or ?publicId=xxx
 */

import { httpAction } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { publicCorsResponse } from "../cors";
import { isValidUuidV7 } from "../../lib/uuid_validation";
import {
  descriptionForPrivacy,
  robotsForPrivacy,
  DEFAULT_CHAT_TITLE,
} from "../../lib/constants/seo";

const MAX_ID_PARAM_LENGTH = 100;

type OgMeta = {
  title: string;
  description: string;
  privacy: string;
  robots: string;
};

async function resolveChat(
  ctx: ActionCtx,
  shareId: string | undefined,
  publicId: string | undefined,
): Promise<{ title?: string; privacy?: string } | null> {
  if (shareId) {
    // @ts-ignore — Permanent Convex limitation: deeply nested generated types
    // in api.chats.* hit TypeScript's TS2589 "type instantiation excessively
    // deep" cap. The same suppression is used across all HTTP route files
    // (publish_export_data.ts, etc.). Convex tracks this upstream.
    return ctx.runQuery(api.chats.getChatByShareIdHttp, { shareId });
  }
  if (publicId) {
    // @ts-ignore — Permanent Convex limitation: deeply nested generated types
    // in api.chats.* hit TypeScript's TS2589 "type instantiation excessively
    // deep" cap. The same suppression is used across all HTTP route files
    // (publish_export_data.ts, etc.). Convex tracks this upstream.
    return ctx.runQuery(api.chats.getChatByPublicId, { publicId });
  }
  return null;
}

export function registerOgMetaRoutes(http: HttpRouter) {
  http.route({
    path: "/api/ogMeta",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin");

      const rawShareId = url.searchParams.get("shareId");
      const rawPublicId = url.searchParams.get("publicId");

      const shareId = rawShareId
        ? String(rawShareId).trim().slice(0, MAX_ID_PARAM_LENGTH)
        : undefined;
      const publicId = rawPublicId
        ? String(rawPublicId).trim().slice(0, MAX_ID_PARAM_LENGTH)
        : undefined;

      if (!shareId && !publicId) {
        return publicCorsResponse({
          body: JSON.stringify({ error: "Missing shareId or publicId" }),
          status: 400,
          origin,
        });
      }

      if (shareId && !isValidUuidV7(shareId)) {
        return publicCorsResponse({
          body: JSON.stringify({ error: "Invalid shareId format" }),
          status: 400,
          origin,
        });
      }
      if (publicId && !isValidUuidV7(publicId)) {
        return publicCorsResponse({
          body: JSON.stringify({ error: "Invalid publicId format" }),
          status: 400,
          origin,
        });
      }

      const chat = await resolveChat(ctx, shareId, publicId);
      if (!chat) {
        return publicCorsResponse({
          body: JSON.stringify({ error: "Chat not found or not accessible" }),
          status: 404,
          origin,
        });
      }

      const privacy = chat.privacy ?? "private";
      const meta: OgMeta = {
        title: typeof chat.title === "string" ? chat.title : DEFAULT_CHAT_TITLE,
        description: descriptionForPrivacy(privacy),
        privacy,
        robots: robotsForPrivacy(privacy),
      };

      return publicCorsResponse({
        body: JSON.stringify(meta),
        status: 200,
        origin,
        extraHeaders: {
          "Cache-Control": "public, max-age=60",
        },
      });
    }),
  });
}
