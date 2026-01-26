/**
 * Publish and export route handlers
 * - POST /api/publishChat
 * - GET /api/exportChat and /api/chatTextMarkdown
 */

import { httpAction } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import {
  escapeHtml,
  formatConversationMarkdown,
  serializeError,
} from "../utils";

/**
 * Helper: determine allowed origin (env-driven; defaults to *)
 */
function getAllowedOrigin(origin: string | null): string {
  const allowed = process.env.CONVEX_ALLOWED_ORIGINS;
  if (!allowed || allowed === "*") return "*";
  const list = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origin) return list[0] || "*";
  return list.includes(origin) ? origin : list[0] || "*";
}

/**
 * Build a JSON response with CORS headers [DRY1]
 */
function buildCorsJsonResponse(
  request: Request,
  body: Record<string, unknown> | string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  const origin = request.headers.get("Origin");
  const allowOrigin = getAllowedOrigin(origin);
  const jsonBody = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(jsonBody, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
      ...extraHeaders,
    },
  });
}

/**
 * Build a text/HTML response with CORS headers [DRY1]
 */
function buildCorsTextResponse(
  request: Request,
  body: string,
  status: number,
  contentType: string,
  extraHeaders?: Record<string, string>,
): Response {
  const origin = request.headers.get("Origin");
  const allowOrigin = getAllowedOrigin(origin);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
      ...extraHeaders,
    },
  });
}

/**
 * Build a CORS preflight response
 */
function buildCorsPreflightResponse(
  request: Request,
  methods: string,
): Response {
  const requested = request.headers.get("Access-Control-Request-Headers");
  const origin = request.headers.get("Origin");
  const allowOrigin = getAllowedOrigin(origin);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": requested || "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

/**
 * Register publish and export routes on the HTTP router
 */
export function registerPublishRoutes(http: HttpRouter) {
  // CORS preflight for /api/publishChat
  http.route({
    path: "/api/publishChat",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      return buildCorsPreflightResponse(request, "POST, OPTIONS");
    }),
  });

  // POST /api/publishChat - Publish anonymous chat
  http.route({
    path: "/api/publishChat",
    method: "POST",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch (error) {
        console.error("❌ PUBLISH INVALID JSON:", serializeError(error));
        return buildCorsJsonResponse(
          request,
          { error: "Invalid JSON body", errorDetails: serializeError(error) },
          400,
        );
      }

      // Validate basic structure and extract payload (validated inline below)
      const payload =
        rawPayload && typeof rawPayload === "object"
          ? (rawPayload as Record<string, unknown>)
          : null;
      if (!payload) {
        return buildCorsJsonResponse(
          request,
          { error: "Invalid request payload" },
          400,
        );
      }

      // Business logic validation
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

      // Validate and normalize messages
      const messages = Array.isArray(payload.messages)
        ? payload.messages.slice(0, 100).map((m: unknown) => {
            const msg = m as Record<string, unknown>;
            const role: "user" | "assistant" =
              msg.role === "user" ? "user" : "assistant";
            return {
              role,
              content: msg.content
                ? String(msg.content).slice(0, 50000)
                : undefined,
              searchResults: Array.isArray(msg.searchResults)
                ? msg.searchResults.slice(0, 20).map((r: unknown) => {
                    const result = r as Record<string, unknown>;
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
        const convexBase = (process.env.CONVEX_SITE_URL || "").replace(
          /\/+$/,
          "",
        );
        const exportBase = convexBase
          ? `${convexBase}/api/exportChat`
          : `/api/exportChat`;
        const llmTxtUrl = `${exportBase}?shareId=${encodeURIComponent(result.shareId)}&format=txt`;

        return buildCorsJsonResponse(
          request,
          { ...result, shareUrl, publicUrl, llmTxtUrl },
          200,
        );
      } catch (e: unknown) {
        const errorInfo = serializeError(e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return buildCorsJsonResponse(
          request,
          { error: errorMessage, errorDetails: errorInfo },
          500,
        );
      }
    }),
  });

  // CORS preflight for /api/exportChat
  http.route({
    path: "/api/exportChat",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      return buildCorsPreflightResponse(request, "GET, OPTIONS");
    }),
  });

  // GET /api/exportChat - Export chat in various formats
  http.route({
    path: "/api/exportChat",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      const url = new URL(request.url);
      const shareIdParam = url.searchParams.get("shareId");
      const publicIdParam = url.searchParams.get("publicId");
      const formatParam = url.searchParams.get("format");
      const accept = (request.headers.get("Accept") || "").toLowerCase();

      // Validate parameters
      const shareId = shareIdParam
        ? String(shareIdParam).trim().slice(0, 100)
        : undefined;
      const publicId = publicIdParam
        ? String(publicIdParam).trim().slice(0, 100)
        : undefined;

      if (!shareId && !publicId) {
        return buildCorsJsonResponse(
          request,
          { error: "Missing shareId or publicId" },
          400,
        );
      }

      // Validate format
      const validFormats = ["json", "markdown", "html", "txt"] as const;
      type Fmt = (typeof validFormats)[number];
      let baseFormat: Fmt = "json";
      if (formatParam) {
        const fmt = formatParam.toLowerCase();
        if (fmt === "markdown" || fmt === "md") baseFormat = "markdown";
        else if (fmt === "html") baseFormat = "html";
        else if (fmt === "txt" || fmt === "text") baseFormat = "txt";
      }

      // Resolve chat by shareId/publicId
      const chat = shareId
        ? await ctx.runQuery(api.chats.getChatByShareIdHttp, { shareId })
        : await ctx.runQuery(api.chats.getChatByPublicId, {
            publicId: publicId!,
          });

      if (!chat) {
        return buildCorsJsonResponse(
          request,
          { error: "Chat not found or not accessible" },
          404,
        );
      }

      // Load messages
      const messages = await ctx.runQuery(api.chats.getChatMessagesHttp, {
        chatId: (chat as any)._id,
      });

      // Normalize minimal objects for export
      const exportedChat = {
        title: (chat as any).title as string,
        shareId: (chat as any).shareId as string | undefined,
        publicId: (chat as any).publicId as string | undefined,
        privacy: (chat as any).privacy as string | undefined,
        createdAt: (chat as any).createdAt as number,
        updatedAt: (chat as any).updatedAt as number,
      };
      const exportedMessages = (messages as any[]).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: (m.content ?? "") as string,
        timestamp: (m.timestamp ?? 0) as number,
        searchResults: Array.isArray(m.searchResults)
          ? m.searchResults
          : undefined,
        sources: Array.isArray(m.sources) ? m.sources : undefined,
      }));

      // Decide format (baseFormat from validation, or from Accept header)
      let fmt = baseFormat;

      // If no explicit format, check Accept header
      if (baseFormat === "json") {
        if (
          accept.includes("text/markdown") ||
          accept.includes("application/markdown")
        ) {
          fmt = "markdown";
        } else if (accept.includes("text/html")) {
          fmt = "html";
        }
      }

      const robots =
        exportedChat.privacy === "public"
          ? "index, follow"
          : "noindex, nofollow";

      if (fmt === "json") {
        const body = JSON.stringify({
          chat: exportedChat,
          messages: exportedMessages,
        });
        const origin = request.headers.get("Origin");
        const allowOrigin = getAllowedOrigin(origin);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowOrigin,
            "X-Robots-Tag": robots,
            Vary: "Accept, Origin",
            "Cache-Control":
              exportedChat.privacy === "public"
                ? "public, max-age=60"
                : "no-cache",
          },
        });
      }

      const md = formatConversationMarkdown({
        title: exportedChat.title,
        messages: exportedMessages as any,
      });

      if (fmt === "txt") {
        const origin = request.headers.get("Origin");
        const allowOrigin = getAllowedOrigin(origin);
        return new Response(md, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": allowOrigin,
            "X-Robots-Tag": robots,
            Vary: "Accept, Origin",
            "Cache-Control":
              exportedChat.privacy === "public"
                ? "public, max-age=60"
                : "no-cache",
          },
        });
      }

      if (fmt === "markdown") {
        const origin = request.headers.get("Origin");
        const allowOrigin = getAllowedOrigin(origin);
        return new Response(md, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Access-Control-Allow-Origin": allowOrigin,
            "X-Robots-Tag": robots,
            Vary: "Accept, Origin",
            "Cache-Control":
              exportedChat.privacy === "public"
                ? "public, max-age=60"
                : "no-cache",
          },
        });
      }

      // HTML wrapper around the markdown content (no server-side markdown parsing to keep deps small)
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(exportedChat.title || "Chat")}</title>
    <meta name="robots" content="${robots}" />
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,Cantarell,Noto Sans,sans-serif;line-height:1.5;margin:1.5rem;color:#111}
      pre{white-space:pre-wrap}
      .container{max-width:820px;margin:0 auto;padding:0 1rem}
      .meta{color:#666;font-size:.9rem;margin-bottom:1rem}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${escapeHtml(exportedChat.title || "Chat")}</h1>
      <div class="meta">Privacy: ${escapeHtml(String(exportedChat.privacy || "unknown"))}</div>
      <pre>${escapeHtml(md)}</pre>
    </div>
  </body>
</html>`;

      const origin = request.headers.get("Origin");
      const allowOrigin = getAllowedOrigin(origin);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": allowOrigin,
          "X-Robots-Tag": robots,
          Vary: "Accept, Origin",
          "Cache-Control":
            exportedChat.privacy === "public"
              ? "public, max-age=60"
              : "no-cache",
        },
      });
    }),
  });

  // CORS preflight for /api/chatTextMarkdown
  http.route({
    path: "/api/chatTextMarkdown",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      return buildCorsPreflightResponse(request, "GET, OPTIONS");
    }),
  });

  // GET /api/chatTextMarkdown - Export chat as plain text Markdown
  http.route({
    path: "/api/chatTextMarkdown",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      const url = new URL(request.url);
      const shareIdParam = url.searchParams.get("shareId");
      const publicIdParam = url.searchParams.get("publicId");

      // Validate parameters
      const shareId = shareIdParam
        ? String(shareIdParam).trim().slice(0, 100)
        : undefined;
      const publicId = publicIdParam
        ? String(publicIdParam).trim().slice(0, 100)
        : undefined;

      if (!shareId && !publicId) {
        return buildCorsJsonResponse(
          request,
          { error: "Missing shareId or publicId" },
          400,
        );
      }
      const chat = shareId
        ? await ctx.runQuery(api.chats.getChatByShareId, { shareId })
        : await ctx.runQuery(api.chats.getChatByPublicId, {
            publicId: publicId!,
          });
      if (!chat) {
        return buildCorsJsonResponse(
          request,
          { error: "Chat not found or not accessible" },
          404,
        );
      }
      const messages = await ctx.runQuery(api.chats.getChatMessagesHttp, {
        chatId: (chat as any)._id,
      });
      const exportedChat = {
        title: (chat as any).title as string,
        privacy: (chat as any).privacy as string | undefined,
      };
      const exportedMessages = (messages as any[]).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: (m.content ?? "") as string,
        timestamp: (m.timestamp ?? 0) as number,
        searchResults: Array.isArray(m.searchResults)
          ? m.searchResults
          : undefined,
        sources: Array.isArray(m.sources) ? m.sources : undefined,
      }));
      const md = formatConversationMarkdown({
        title: exportedChat.title,
        messages: exportedMessages as any,
      });
      const robots =
        exportedChat.privacy === "public"
          ? "index, follow"
          : "noindex, nofollow";
      const cacheControl =
        exportedChat.privacy === "public" ? "public, max-age=60" : "no-cache";
      return buildCorsTextResponse(
        request,
        md,
        200,
        "text/plain; charset=utf-8",
        {
          "X-Robots-Tag": robots,
          "Cache-Control": cacheControl,
          Vary: "Accept, Origin",
        },
      );
    }),
  });
}
