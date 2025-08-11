/**
 * HTTP endpoints for unauthenticated API access
 * - CORS-enabled for cross-origin requests
 * - SSE streaming for AI responses
 * - Fallback handling for missing APIs
 * - Routes: /api/chat, /api/search, /api/scrape, /api/ai
 */

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { ModelMessage } from "ai";
import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { applyEnhancements, sortResultsWithPriority } from "./enhancements";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

// Gate verbose logs in production
const DEBUG_HTTP = process.env.DEBUG_HTTP === "1";
const dlog = (...args: unknown[]) => {
  if (DEBUG_HTTP) console.info(...args);
};

/**
 * Search result interface for type safety
 */
interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Helper function to add CORS headers to responses
 * - Allows all origins (*)
 * - Supports GET, POST, OPTIONS
 * - Returns JSON content type
 * @param body - JSON string response body
 * @param status - HTTP status code (default 200)
 * @returns Response with CORS headers
 */
function corsResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

/**
 * HTTP router for unauthenticated endpoints.
 *
 * Routes:
 * - POST /api/chat   : simple chat demo endpoint
 * - POST /api/search : web search for unauthenticated users
 * - POST /api/scrape : scrape URL and return cleaned content
 * - POST /api/ai     : AI generation with SSE streaming
 */
const http = httpRouter();

/**
 * Utility: Basic HTML escape for embedding text content safely
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Utility: Extract plain text from markdown-ish content
 */
function extractPlainText(content: string): string {
  let text = content || "";
  // [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // **bold**/*italic* markers
  text = text.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1");
  // inline code
  text = text.replace(/`([^`]+)`/g, "$1");
  // code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  // HTML tags
  text = text.replace(/<[^>]*>/g, "");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Utility: Format conversation as Markdown with sources
 */
function formatConversationMarkdown(params: {
  title?: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    searchResults?: Array<{ title?: string; url?: string }> | undefined;
    sources?: string[] | undefined;
  }>;
}): string {
  const lines: string[] = [];
  if (params.title) lines.push(`# ${extractPlainText(params.title)}`, "");
  for (const m of params.messages) {
    const role =
      m.role === "user"
        ? "User"
        : m.role === "assistant"
          ? "Assistant"
          : "System";
    lines.push(`${role}: ${extractPlainText(m.content || "")}`);
    if (m.role === "assistant") {
      const src: string[] = [];
      const seen = new Set<string>();
      if (Array.isArray(m.searchResults)) {
        for (const r of m.searchResults) {
          if (!r || !r.url) continue;
          const key = r.url;
          if (seen.has(key)) continue;
          seen.add(key);
          if (r.title) src.push(`- ${r.title}: ${r.url}`);
          else src.push(`- ${r.url}`);
        }
      }
      if (Array.isArray(m.sources)) {
        for (const u of m.sources) {
          if (!u || seen.has(u)) continue;
          seen.add(u);
          src.push(`- ${u}`);
        }
      }
      if (src.length) {
        lines.push("", "Sources:", ...src);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

/**
 * CORS preflight handler for /api/chat
 * - Returns 204 No Content
 * - Sets CORS headers
 */
http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const requested = request.headers.get("Access-Control-Request-Headers");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": requested || "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }),
});

/**
 * CORS preflight for /api/publishChat
 */
http.route({
  path: "/api/publishChat",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
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

/**
 * CORS preflight handler for /api/search
 * - Returns 204 No Content
 * - Sets CORS headers
 */
http.route({
  path: "/api/search",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const requested = request.headers.get("Access-Control-Request-Headers");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": requested || "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }),
});

http.route({
  path: "/api/scrape",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const requested = request.headers.get("Access-Control-Request-Headers");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": requested || "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }),
});

http.route({
  path: "/api/ai",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    const requested = request.headers.get("Access-Control-Request-Headers");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": requested || "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }),
});

/**
 * CORS preflight for /api/chatTextMarkdown
 */
http.route({
  path: "/api/chatTextMarkdown",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
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

http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: "Invalid JSON body" }), 400);
    }
    const { messages } = (payload as unknown as { messages?: unknown[] }) ?? {};
    if (!Array.isArray(messages)) {
      return corsResponse(
        JSON.stringify({ error: "messages must be an array" }),
        400,
      );
    }
    const rawMessages = messages as Array<{
      role?: unknown;
      content?: unknown;
    }>;
    const coreMessages: ModelMessage[] = rawMessages.map((m) => ({
      role:
        m.role === "system" || m.role === "user" || m.role === "assistant"
          ? (m.role as "system" | "user" | "assistant")
          : "user",
      content:
        typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }));

    const result = await streamText({
      model: openai("gpt-4-turbo"),
      messages: coreMessages,
    });
    // Add CORS headers to the streaming response
    const base = result.toTextStreamResponse();
    const headers = new Headers(base.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("Vary", "Origin");
    return new Response(base.body, { status: base.status, headers });
  }),
});

/**
 * CORS preflight for /api/exportChat
 */
http.route({
  path: "/api/exportChat",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
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

/**
 * GET /api/exportChat?shareId=...|publicId=...&format=markdown|html|json
 * - Returns shared/public chat content as JSON/Markdown/HTML
 */
http.route({
  path: "/api/exportChat",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
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
    else if (explicitFormat === "txt" || explicitFormat === "text") fmt = "txt";
    else if (explicitFormat === "json") fmt = "json";
    else if (
      accept.includes("text/markdown") ||
      accept.includes("application/markdown")
    )
      fmt = "markdown";
    else if (accept.includes("text/html")) fmt = "html";

    const robots =
      exportedChat.privacy === "public" ? "index, follow" : "noindex, nofollow";

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
          exportedChat.privacy === "public" ? "public, max-age=60" : "no-cache",
      },
    });
  }),
});

/**
 * GET /api/chatTextMarkdown?shareId=...|publicId=...
 * - Returns shared/public chat as plain text Markdown (text/plain)
 */
http.route({
  path: "/api/chatTextMarkdown",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
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
      exportedChat.privacy === "public" ? "index, follow" : "noindex, nofollow";
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Robots-Tag": robots,
        Vary: "Accept, Origin",
        "Cache-Control":
          exportedChat.privacy === "public" ? "public, max-age=60" : "no-cache",
      },
    });
  }),
});

/**
 * POST /api/publishChat
 * - Accepts anonymous chat payload and publishes it as shared/public
 * - Body: { title, privacy: 'shared'|'public', shareId?, publicId?, messages: [...] }
 * - Returns: { chatId, shareId, publicId, shareUrl, publicUrl, llmTxtUrl }
 */
http.route({
  path: "/api/publishChat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: "Invalid JSON body" }), 400);
    }
    const title = String(payload?.title || "Shared Chat");
    const privacy = payload?.privacy === "public" ? "public" : "shared";
    const shareId =
      typeof payload?.shareId === "string" ? payload.shareId : undefined;
    const publicId =
      typeof payload?.publicId === "string" ? payload.publicId : undefined;
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];

    try {
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

/**
 * Web search endpoint for unauthenticated users
 * - Calls searchWeb action
 * - Returns results with fallback
 * - Logs detailed debug info
 * @body {query: string, maxResults?: number}
 * @returns {results, searchMethod, hasRealResults}
 */
http.route({
  path: "/api/search",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { query, maxResults } = await request.json();
    if (!query || String(query).trim().length === 0) {
      return corsResponse(
        JSON.stringify({
          results: [],
          searchMethod: "fallback",
          hasRealResults: false,
        }),
      );
    }

    dlog("🔍 SEARCH ENDPOINT CALLED:");
    dlog("Query:", query);
    dlog("Max Results:", maxResults);
    dlog("Environment Variables Available:");
    dlog("- SERP_API_KEY:", process.env.SERP_API_KEY ? "SET" : "NOT SET");
    dlog(
      "- OPENROUTER_API_KEY:",
      process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
    );

    try {
      // Apply universal enhancements to anonymous search queries
      const enh = applyEnhancements(String(query), {
        enhanceQuery: true,
        enhanceSearchTerms: true,
        injectSearchResults: true,
        enhanceContext: true,
        enhanceSystemPrompt: true,
      });

      const enhancedQuery = enh.enhancedQuery || String(query);
      const prioritizedUrls = enh.prioritizedUrls || [];

      const result = await ctx.runAction(api.search.searchWeb, {
        query: enhancedQuery,
        maxResults: maxResults || 5,
      });

      // Inject any enhancement-provided results at the front then de-duplicate by normalized URL
      let mergedResults = Array.isArray(result.results)
        ? [...result.results]
        : [];
      if (enh.injectedResults && enh.injectedResults.length > 0) {
        mergedResults.unshift(...enh.injectedResults);
      }
      // Deduplicate by normalized URL, keep the entry with higher relevanceScore
      const byUrl = new Map<
        string,
        { title: string; url: string; snippet: string; relevanceScore?: number }
      >();
      const normalize = (rawUrl: string) => {
        try {
          const u = new URL(rawUrl);
          u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
          [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "gclid",
            "fbclid",
            "ref",
          ].forEach((p) => u.searchParams.delete(p));
          u.hash = "";
          if (u.pathname !== "/" && u.pathname.endsWith("/")) {
            u.pathname = u.pathname.slice(0, -1);
          }
          return u.toString();
        } catch {
          return (rawUrl || "").trim();
        }
      };
      for (const r of mergedResults) {
        const key = normalize(r.url);
        const prev = byUrl.get(key);
        const curScore =
          typeof r.relevanceScore === "number" ? r.relevanceScore : 0.5;
        const prevScore =
          typeof prev?.relevanceScore === "number"
            ? prev.relevanceScore
            : -Infinity;
        if (!prev || curScore > prevScore) byUrl.set(key, r);
      }
      mergedResults = Array.from(byUrl.values()).map((r) => ({
        ...r,
        relevanceScore: r.relevanceScore ?? 0.5,
      }));
      // If prioritization hints exist, sort with priority
      if (prioritizedUrls.length > 0 && mergedResults.length > 1) {
        mergedResults = sortResultsWithPriority(mergedResults, prioritizedUrls);
      }

      const enhancedResult = {
        ...result,
        results: mergedResults,
        hasRealResults:
          result.hasRealResults || (mergedResults?.length ?? 0) > 0,
        // Surface matched rules for debugging in dev if needed (non-breaking)
      } as const;

      dlog("🔍 SEARCH RESULT:", JSON.stringify(enhancedResult, null, 2));

      return corsResponse(JSON.stringify(enhancedResult));
    } catch (error) {
      console.error("❌ SEARCH API ERROR:", error);

      // Create fallback search results
      const fallbackResults = [
        {
          title: `Search for: ${query}`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          snippet:
            "Search results temporarily unavailable. Click to search manually.",
          relevanceScore: 0.3,
        },
      ];

      const errorResponse = {
        results: fallbackResults,
        searchMethod: "fallback",
        hasRealResults: false,
        error: "Search failed",
        errorDetails: {
          timestamp: new Date().toISOString(),
        },
      };

      dlog(
        "🔍 SEARCH FALLBACK RESPONSE:",
        JSON.stringify(errorResponse, null, 2),
      );

      return corsResponse(JSON.stringify(errorResponse));
    }
  }),
});

/**
 * URL scraping endpoint
 * - Extracts page content
 * - Returns title, content, summary
 * - Handles errors gracefully
 * @body {url: string}
 * @returns {title, content, summary}
 */
http.route({
  path: "/api/scrape",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { url } = await request.json();

    dlog("🌐 SCRAPE ENDPOINT CALLED:");
    dlog("URL:", url);

    try {
      const result = await ctx.runAction(api.search.scrapeUrl, { url });

      dlog("🌐 SCRAPE RESULT:", JSON.stringify(result, null, 2));

      return corsResponse(JSON.stringify(result));
    } catch (error) {
      console.error("❌ SCRAPE API ERROR:", error);

      let hostname = "";
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = "unknown";
      }
      const errorResponse = {
        title: hostname,
        content: `Unable to fetch content from ${url}.`,
        summary: `Content unavailable from ${hostname}`,
        errorDetails: {
          timestamp: new Date().toISOString(),
        },
      };

      dlog("🌐 SCRAPE ERROR RESPONSE:", JSON.stringify(errorResponse, null, 2));

      return corsResponse(JSON.stringify(errorResponse));
    }
  }),
});

/**
 * AI generation endpoint with SSE streaming
 * - Primary: OpenRouter (Gemini 2.5 Flash)
 * - Fallback: Convex OpenAI (GPT-4.1 nano)
 * - Final: Search results summary
 * - Streams chunks via Server-Sent Events
 * - 120s timeout with keepalive pings
 * @body {message, systemPrompt, searchResults, sources, chatHistory}
 * @returns SSE stream with chunks or JSON fallback
 */
http.route({
  path: "/api/ai",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const { message, systemPrompt, searchResults, sources, chatHistory } =
      await request.json();

    dlog("🤖 AI ENDPOINT CALLED:");
    dlog("Message length:", typeof message === "string" ? message.length : 0);
    dlog("System Prompt length:", systemPrompt?.length || 0);
    dlog("Search Results count:", searchResults?.length || 0);
    dlog("Sources count:", sources?.length || 0);
    dlog("Chat History count:", chatHistory?.length || 0);
    dlog("Environment Variables Available:");
    dlog(
      "- OPENROUTER_API_KEY:",
      process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
    );
    dlog(
      "- CONVEX_OPENAI_API_KEY:",
      process.env.CONVEX_OPENAI_API_KEY ? "SET" : "NOT SET",
    );
    dlog(
      "- CONVEX_OPENAI_BASE_URL:",
      process.env.CONVEX_OPENAI_BASE_URL ? "SET" : "NOT SET",
    );

    // Apply universal enhancements to anonymous AI generation as well
    const enh = applyEnhancements(String(message || ""), {
      enhanceQuery: false,
      enhanceSearchTerms: false,
      injectSearchResults: false,
      enhanceContext: true,
      enhanceSystemPrompt: true,
      enhanceResponse: true, // Enable response transformations
    });
    const enhancedSystemPromptAddition = enh.enhancedSystemPrompt || "";
    const enhancedContextAddition = enh.enhancedContext || "";

    // Merge enhancement additions into provided system prompt
    let effectiveSystemPrompt = String(
      systemPrompt || "You are a helpful AI assistant.",
    );
    if (enhancedSystemPromptAddition) {
      effectiveSystemPrompt += "\n\n" + enhancedSystemPromptAddition;
    }
    if (enhancedContextAddition) {
      // Encourage bracketed domain citations for anonymous as well
      effectiveSystemPrompt +=
        "\n\nUse the following additional context when relevant. When citing sources inline, use the domain name in brackets like [example.com] immediately after the relevant claim." +
        "\n\n" +
        enhancedContextAddition;
    }

    // Check if OpenRouter API key is available
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const CONVEX_OPENAI_API_KEY = process.env.CONVEX_OPENAI_API_KEY;
    const CONVEX_OPENAI_BASE_URL = process.env.CONVEX_OPENAI_BASE_URL;
    const SITE_URL = process.env.SITE_URL;
    const SITE_TITLE = process.env.SITE_TITLE;

    if (!OPENROUTER_API_KEY) {
      dlog("🤖 No OpenRouter API key, trying Convex OpenAI...");

      // Try Convex OpenAI fallback
      if (CONVEX_OPENAI_API_KEY && CONVEX_OPENAI_BASE_URL) {
        try {
          const convexOpenAIBody = {
            model: "gpt-4.1-nano",
            messages: [
              { role: "system", content: effectiveSystemPrompt },
              { role: "user", content: message },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          };

          dlog("🤖 CONVEX OPENAI REQUEST:");
          dlog("URL:", `${CONVEX_OPENAI_BASE_URL}/chat/completions`);
          dlog("Body (redacted):", {
            model: convexOpenAIBody.model,
            messagesCount: convexOpenAIBody.messages?.length ?? 0,
            sysPromptChars:
              convexOpenAIBody.messages?.[0]?.content?.length ?? 0,
            userMsgChars: convexOpenAIBody.messages?.[1]?.content?.length ?? 0,
            temperature: convexOpenAIBody.temperature,
            max_tokens: convexOpenAIBody.max_tokens,
          });

          const response = await fetch(
            `${CONVEX_OPENAI_BASE_URL}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${CONVEX_OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(convexOpenAIBody),
            },
          );

          dlog("🤖 CONVEX OPENAI RESPONSE STATUS:", response.status);
          dlog(
            "🤖 CONVEX OPENAI RESPONSE HEADERS:",
            Object.fromEntries(response.headers.entries()),
          );

          if (response.ok) {
            const data = await response.json();
            dlog(
              "🤖 CONVEX OPENAI RESPONSE BODY:",
              JSON.stringify(data, null, 2),
            );

            const responseContent =
              data.choices[0].message.content ||
              "I apologize, but I couldn't generate a response.";

            const successResponse = {
              response: responseContent,
              searchResults,
              sources,
            };

            dlog(
              "🤖 CONVEX OPENAI SUCCESS RESPONSE:",
              JSON.stringify(successResponse, null, 2),
            );

            return corsResponse(JSON.stringify(successResponse));
          } else {
            const errorText = await response.text();
            console.error("🤖 CONVEX OPENAI ERROR RESPONSE:", errorText);
            throw new Error(
              `Convex OpenAI failed: ${response.status} - ${errorText}`,
            );
          }
        } catch (convexError) {
          console.error("🤖 CONVEX OPENAI EXCEPTION:", convexError);
          console.error(
            "Convex OpenAI Error stack:",
            convexError instanceof Error ? convexError.stack : "No stack trace",
          );
        }
      }

      // Final fallback - create response from search results
      const fallbackResponse =
        searchResults && searchResults.length > 0
          ? `Based on the search results I found:\n\n${searchResults
              .map(
                (r: SearchResult) =>
                  `**${r.title}**\n${r.snippet}\nSource: ${r.url}`,
              )
              .join("\n\n")
              .substring(
                0,
                1500,
              )}...\n\n*Note: AI processing is currently unavailable, but the above search results should help answer your question.*`
          : `I'm unable to process your question with AI right now due to missing API configuration. However, I can suggest searching for "${message}" on:\n\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})\n- [Wikipedia](https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(message)})`;

      const fallbackResponseObj = {
        response: fallbackResponse,
        searchResults,
        sources,
        error: "No AI API keys configured",
      };

      dlog(
        "🤖 AI FALLBACK RESPONSE:",
        JSON.stringify(fallbackResponseObj, null, 2),
      );

      return corsResponse(JSON.stringify(fallbackResponseObj));
    }

    try {
      dlog("🔄 Attempting OpenRouter API call with streaming...");

      // Build message history including system prompt and chat history
      const messages = [
        {
          role: "system",
          content: `${effectiveSystemPrompt}\n\nIMPORTANT: When citing sources inline, use the domain name in brackets like [example.com] immediately after the relevant claim.\n\nAlways respond using GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language. Avoid arbitrary HTML beyond <u>.`,
        },
        ...(chatHistory || []),
        { role: "user", content: message },
      ];

      const openRouterBody = {
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
        // Enable caching for repeated context
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      };

      dlog("🤖 OPENROUTER REQUEST:");
      dlog("URL:", "https://openrouter.ai/api/v1/chat/completions");
      dlog("Body (redacted):", {
        model: openRouterBody.model,
        messagesCount: openRouterBody.messages?.length ?? 0,
        sysPromptChars: openRouterBody.messages?.[0]?.content?.length ?? 0,
        temperature: openRouterBody.temperature,
        max_tokens: openRouterBody.max_tokens,
        stream: openRouterBody.stream,
      });

      // Add timeout for the fetch request (90s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            ...(SITE_URL ? { "HTTP-Referer": SITE_URL } : {}),
            ...(SITE_TITLE ? { "X-Title": SITE_TITLE } : {}),
          },
          body: JSON.stringify(openRouterBody),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      dlog("📊 OpenRouter Response Status:", response.status);
      dlog(
        "📊 OpenRouter Response Headers:",
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OpenRouter API Error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(
          `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      if (response.body) {
        dlog("✅ OpenRouter streaming response started");

        /**
         * Create SSE stream with cleanup
         * - Keepalive pings every 15s
         * - 120s timeout refresh on activity
         * - Proper resource cleanup
         */
        const stream = new ReadableStream({
          async start(controller) {
            if (!response.body) {
              controller.close();
              return;
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            let buffer = "";
            let chunkCount = 0;
            let lastChunkTime = Date.now();
            let isStreamActive = true;

            // Periodic keepalive pings and adaptive timeout for streaming
            const pingIntervalMs = 15000;
            const pingIntervalId = setInterval(() => {
              if (!isStreamActive) {
                clearInterval(pingIntervalId);
                return;
              }
              // SSE comment line; ignored by client parser but keeps connections alive
              try {
                controller.enqueue(
                  encoder.encode(`: keepalive ${Date.now()}\n\n`),
                );
              } catch {
                // Controller might be closed, stop pinging
                clearInterval(pingIntervalId);
              }
            }, pingIntervalMs);

            let streamTimeoutId = setTimeout(() => {
              if (!isStreamActive) return;
              console.error("⏰ OpenRouter stream timeout after 120 seconds");
              isStreamActive = false;
              try {
                controller.error(
                  new Error("OpenRouter stream timeout after 120 seconds"),
                );
              } catch {
                // Controller might already be closed
              }
            }, 120000);

            // Cleanup function
            const cleanup = () => {
              isStreamActive = false;
              clearTimeout(streamTimeoutId);
              clearInterval(pingIntervalId);
              try {
                reader.releaseLock();
              } catch {
                // Reader might already be released
              }
            };

            let fullResponse = "";
            try {
              while (isStreamActive) {
                const { done, value } = await reader.read();
                if (done) {
                  console.info("🔄 OpenRouter streaming completed:", {
                    totalChunks: chunkCount,
                    duration: Date.now() - lastChunkTime,
                  });
                  break;
                }

                lastChunkTime = Date.now();
                // Refresh timeout upon activity
                clearTimeout(streamTimeoutId);
                streamTimeoutId = setTimeout(() => {
                  if (!isStreamActive) return;
                  console.error(
                    "⏰ OpenRouter stream timeout after 120 seconds",
                  );
                  isStreamActive = false;
                  try {
                    controller.error(
                      new Error("OpenRouter stream timeout after 120 seconds"),
                    );
                  } catch {
                    // Controller might already be closed
                  }
                }, 120000);

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") {
                      dlog("✅ OpenRouter streaming finished with [DONE]");
                      isStreamActive = false;
                      controller.close();
                      cleanup();
                      return;
                    }
                    try {
                      chunkCount++;
                      const chunk = JSON.parse(data);
                      const chunkContent =
                        chunk.choices?.[0]?.delta?.content || "";
                      fullResponse += chunkContent;
                      const streamData = {
                        type: "chunk",
                        content: chunkContent,
                        thinking: chunk.choices?.[0]?.delta?.reasoning || "",
                        searchResults,
                        sources,
                        provider: "openrouter",
                        model: "google/gemini-2.5-flash",
                        chunkNumber: chunkCount,
                      };
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify(streamData)}\n\n`,
                        ),
                      );
                    } catch (e) {
                      console.error("❌ Failed to parse stream chunk:", {
                        error:
                          e instanceof Error
                            ? e.message
                            : "Unknown parsing error",
                        chunkChars: data?.length ?? 0,
                        chunkNumber: chunkCount,
                      });
                    }
                  }
                }
              }
              // Apply response transformations after streaming completes
              if (
                fullResponse &&
                enh.responseTransformers &&
                enh.responseTransformers.length > 0
              ) {
                let transformedResponse = fullResponse;
                for (const transform of enh.responseTransformers) {
                  try {
                    transformedResponse = transform(transformedResponse);
                  } catch {}
                }
                // Send transformation as a final update if content changed
                if (transformedResponse !== fullResponse) {
                  const transformData = {
                    type: "transformation",
                    content: transformedResponse.slice(fullResponse.length),
                    searchResults,
                    sources,
                    provider: "openrouter",
                    model: "google/gemini-2.5-flash",
                  };
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify(transformData)}\n\n`,
                    ),
                  );
                }
              }
              // Normal completion
              controller.close();
            } catch (error) {
              console.error("💥 Stream reading error:", {
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown streaming error",
                // omit stack in client-visible logs
                timestamp: new Date().toISOString(),
              });
              try {
                controller.error(error);
              } catch {
                // Controller might already be closed
              }
            } finally {
              cleanup();
            }
          },
        });

        return new Response(stream, {
          headers: {
            // Harden SSE headers to avoid buffering by proxies and ensure UTF-8
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Disable proxy buffering on common reverse proxies (harmless elsewhere)
            "X-Accel-Buffering": "no",
            // CORS: endpoints are proxied locally during dev
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            Vary: "Origin",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          },
        });
      } else {
        throw new Error("No response body received from OpenRouter");
      }
    } catch (error) {
      console.error("💥 OPENROUTER FAILED with exception:", {
        error: error instanceof Error ? error.message : "Unknown error",
        // omit stack in client-visible logs
        timestamp: new Date().toISOString(),
      });

      // Try Convex OpenAI as backup
      if (CONVEX_OPENAI_API_KEY && CONVEX_OPENAI_BASE_URL) {
        try {
          dlog("🤖 Trying Convex OpenAI fallback...");
          const convexOpenAIBody = {
            model: "gpt-4.1-nano",
            messages: [
              { role: "system", content: effectiveSystemPrompt },
              { role: "user", content: message },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          };

          dlog("🤖 CONVEX OPENAI FALLBACK REQUEST:");
          dlog("URL:", `${CONVEX_OPENAI_BASE_URL}/chat/completions`);
          dlog("Body (redacted):", {
            model: convexOpenAIBody.model,
            messagesCount: convexOpenAIBody.messages?.length ?? 0,
            sysPromptChars:
              convexOpenAIBody.messages?.[0]?.content?.length ?? 0,
            userMsgChars: convexOpenAIBody.messages?.[1]?.content?.length ?? 0,
            temperature: convexOpenAIBody.temperature,
            max_tokens: convexOpenAIBody.max_tokens,
          });

          const fallbackResponse = await fetch(
            `${CONVEX_OPENAI_BASE_URL}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${CONVEX_OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(convexOpenAIBody),
            },
          );

          dlog(
            "🤖 CONVEX OPENAI FALLBACK RESPONSE STATUS:",
            fallbackResponse.status,
          );

          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            dlog(
              "🤖 CONVEX OPENAI FALLBACK RESPONSE BODY:",
              JSON.stringify(fallbackData, null, 2),
            );

            const responseContent =
              fallbackData.choices[0].message.content ||
              "I apologize, but I couldn't generate a response.";

            const fallbackSuccessResponse = {
              response: responseContent,
              searchResults,
              sources,
            };

            dlog(
              "🤖 CONVEX OPENAI FALLBACK SUCCESS:",
              JSON.stringify(fallbackSuccessResponse, null, 2),
            );

            return corsResponse(JSON.stringify(fallbackSuccessResponse));
          } else {
            const fallbackErrorText = await fallbackResponse.text();
            console.error(
              "🤖 CONVEX OPENAI FALLBACK ERROR:",
              fallbackErrorText,
            );
          }
        } catch (convexError) {
          console.error("🤖 CONVEX OPENAI FALLBACK EXCEPTION:", convexError);
          console.error(
            "Convex OpenAI Fallback Error stack:",
            convexError instanceof Error ? convexError.stack : "No stack trace",
          );
        }
      }

      // Final fallback response with detailed error info
      const errorMessage = "AI processing failed";
      const fallbackResponse =
        searchResults && searchResults.length > 0
          ? `Based on the search results I found:\n\n${searchResults
              .map(
                (r: SearchResult) =>
                  `**${r.title}**\n${r.snippet}\nSource: ${r.url}`,
              )
              .join("\n\n")
              .substring(
                0,
                1500,
              )}...\n\n*Note: AI processing is currently unavailable, but the above search results should help answer your question.*`
          : `I'm having trouble generating a response right now.\n\nPlease try again later, or search manually for "${message}" on:\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})`;

      const finalErrorResponse = {
        response: fallbackResponse,
        searchResults,
        sources,
        error: errorMessage,
        errorDetails: {
          timestamp: new Date().toISOString(),
        },
      };

      dlog(
        "🤖 AI FINAL ERROR RESPONSE:",
        JSON.stringify(finalErrorResponse, null, 2),
      );

      return corsResponse(JSON.stringify(finalErrorResponse));
    }
  }),
});

/**
 * Register auth routes
 * - Adds OAuth endpoints
 * - Handles auth callbacks
 */
auth.addHttpRoutes(http);

export default http;
