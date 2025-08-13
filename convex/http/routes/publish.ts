/**
 * Publish and export route handlers
 * - POST /api/publishChat
 * - GET /api/exportChat and /api/chatTextMarkdown
 */

import { httpAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, escapeHtml, formatConversationMarkdown } from "../utils";

/**
 * Register publish and export routes on the HTTP router
 */
export function registerPublishRoutes(http: HttpRouter) {
  // CORS preflight for /api/publishChat
  http.route({
    path: "/api/publishChat",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": requested || "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }),
  });

  // POST /api/publishChat - Publish anonymous chat
  http.route({
    path: "/api/publishChat",
    method: "POST",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      let payload: any;
      try {
        payload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
        );
      }
      const title = String(payload?.title || "Shared Chat");
      const privacy = payload?.privacy === "public" ? "public" : "shared";
      const shareId =
        typeof payload?.shareId === "string" ? payload.shareId : undefined;
      const publicId =
        typeof payload?.publicId === "string" ? payload.publicId : undefined;
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];

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
        const origin = request.headers.get("Origin") || "";
        const baseUrl = origin || process.env.SITE_URL || "";
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

        return new Response(
          JSON.stringify({ ...result, shareUrl, publicUrl, llmTxtUrl }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      } catch (e: any) {
        return corsResponse(
          JSON.stringify({ error: String(e?.message || e) }),
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
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": requested || "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }),
  });

  // GET /api/exportChat - Export chat in various formats
  http.route({
    path: "/api/exportChat",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      const url = new URL(request.url);
      const shareId = url.searchParams.get("shareId");
      const publicId = url.searchParams.get("publicId");
      const explicitFormat = url.searchParams.get("format");
      const accept = (request.headers.get("Accept") || "").toLowerCase();

      if (!shareId && !publicId) {
        return new Response(
          JSON.stringify({ error: "Missing shareId or publicId" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      // Resolve chat by shareId/publicId
      const chat = shareId
        ? await ctx.runQuery(api.chats.getChatByShareId, { shareId })
        : await ctx.runQuery(api.chats.getChatByPublicId, {
            publicId: publicId!,
          });

      if (!chat) {
        return new Response(
          JSON.stringify({ error: "Chat not found or not accessible" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      // Load messages
      const messages = await ctx.runQuery(api.chats.getChatMessages, {
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

      // Decide format
      type Fmt = "json" | "markdown" | "html" | "txt";
      let fmt: Fmt = "json";
      if (explicitFormat === "markdown" || explicitFormat === "md")
        fmt = "markdown";
      else if (explicitFormat === "html") fmt = "html";
      else if (explicitFormat === "txt" || explicitFormat === "text")
        fmt = "txt";
      else if (explicitFormat === "json") fmt = "json";
      else if (
        accept.includes("text/markdown") ||
        accept.includes("application/markdown")
      )
        fmt = "markdown";
      else if (accept.includes("text/html")) fmt = "html";

      const robots =
        exportedChat.privacy === "public"
          ? "index, follow"
          : "noindex, nofollow";

      if (fmt === "json") {
        const body = JSON.stringify({
          chat: exportedChat,
          messages: exportedMessages,
        });
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
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
        return new Response(md, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
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
        return new Response(md, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
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

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
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
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": requested || "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }),
  });

  // GET /api/chatTextMarkdown - Export chat as plain text Markdown
  http.route({
    path: "/api/chatTextMarkdown",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      const url = new URL(request.url);
      const shareId = url.searchParams.get("shareId");
      const publicId = url.searchParams.get("publicId");
      if (!shareId && !publicId) {
        return new Response(
          JSON.stringify({ error: "Missing shareId or publicId" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
      const chat = shareId
        ? await ctx.runQuery(api.chats.getChatByShareId, { shareId })
        : await ctx.runQuery(api.chats.getChatByPublicId, {
            publicId: publicId!,
          });
      if (!chat) {
        return new Response(
          JSON.stringify({ error: "Chat not found or not accessible" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
      const messages = await ctx.runQuery(api.chats.getChatMessages, {
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
      return new Response(md, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
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
}
