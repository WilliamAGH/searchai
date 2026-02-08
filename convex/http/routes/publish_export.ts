import type { ActionCtx } from "../../_generated/server";
import { escapeHtml } from "../utils";
import { publicCorsResponse } from "../cors";
import { loadExportData } from "./publish_export_data";

type ExportFormat = "json" | "markdown" | "html" | "txt";

function resolveFormat(request: Request): ExportFormat {
  const url = new URL(request.url);
  const formatParam = url.searchParams.get("format");
  const accept = (request.headers.get("Accept") || "").toLowerCase();

  let baseFormat: ExportFormat = "json";
  if (formatParam) {
    const fmt = formatParam.toLowerCase();
    if (fmt === "markdown" || fmt === "md") baseFormat = "markdown";
    else if (fmt === "html") baseFormat = "html";
    else if (fmt === "txt" || fmt === "text") baseFormat = "txt";
  }

  if (baseFormat === "json") {
    if (
      accept.includes("text/markdown") ||
      accept.includes("application/markdown")
    ) {
      return "markdown";
    }
    if (accept.includes("text/html")) {
      return "html";
    }
  }

  return baseFormat;
}

type HtmlExportPageParams = {
  title: string;
  privacy: string;
  markdown: string;
  robots: string;
};

function buildHtmlExportPage(params: HtmlExportPageParams): string {
  const { title, privacy, markdown, robots } = params;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
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
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Privacy: ${escapeHtml(privacy)}</div>
      <pre>${escapeHtml(markdown)}</pre>
    </div>
  </body>
</html>`;
}

export async function handleExportChat(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");

  const exportResult = await loadExportData(ctx, request, "http");
  if (!exportResult.ok) return exportResult.response;

  const { chat, messages, markdown, robots, cacheControl } = exportResult.data;
  const format = resolveFormat(request);
  const sharedHeaders = {
    "X-Robots-Tag": robots,
    Vary: "Accept, Origin",
    "Cache-Control": cacheControl,
  };

  if (format === "json") {
    return publicCorsResponse({
      body: JSON.stringify({ chat, messages }),
      status: 200,
      origin,
      extraHeaders: sharedHeaders,
    });
  }

  if (format === "txt") {
    return publicCorsResponse({
      body: markdown,
      status: 200,
      origin,
      contentType: "text/plain; charset=utf-8",
      extraHeaders: sharedHeaders,
    });
  }

  if (format === "markdown") {
    return publicCorsResponse({
      body: markdown,
      status: 200,
      origin,
      contentType: "text/markdown; charset=utf-8",
      extraHeaders: sharedHeaders,
    });
  }

  return publicCorsResponse({
    body: buildHtmlExportPage({
      title: chat.title || "Chat",
      privacy: String(chat.privacy || "unknown"),
      markdown,
      robots,
    }),
    status: 200,
    origin,
    contentType: "text/html; charset=utf-8",
    extraHeaders: sharedHeaders,
  });
}
