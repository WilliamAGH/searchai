/**
 * Utility functions for HTTP endpoints
 */

/**
 * Serialize an error for JSON responses
 * - Extracts name, message, stack, and cause from Error objects
 * - Converts non-Error values to string messages
 */
export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as Error & { cause?: unknown }).cause,
    };
  }
  return { message: String(error) };
}

// Gate verbose logs in production
export const DEBUG_HTTP = process.env.DEBUG_HTTP === "1";
export const dlog = (...args: unknown[]) => {
  if (DEBUG_HTTP) console.info(...args);
};

/**
 * Helper function to add CORS headers to responses
 * - Allows all origins (*)
 * - Supports GET, POST, OPTIONS
 * - Returns JSON content type
 * @param body - JSON string response body
 * @param status - HTTP status code (default 200)
 * @returns Response with CORS headers
 */
// Re-export from the canonical location
export { corsResponse } from "./cors";

/**
 * Compute CORS headers based on request Origin and allowed origins list.
 * If CONVEX_ALLOWED_ORIGINS is unset, allow all origins (dev default).
 */
export function corsHeadersForRequest(
  request: Request,
  methods: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const origin = request.headers.get("Origin");
  const raw = (process.env.CONVEX_ALLOWED_ORIGINS || "").trim();
  const allowList = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  let allowOrigin = "*";
  if (allowList.length > 0) {
    if (origin && allowList.includes(origin)) {
      allowOrigin = origin;
    } else {
      // Not in allow list: return a safe default that does not echo arbitrary origin
      allowOrigin = "null";
    }
  }

  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers":
      request.headers.get("Access-Control-Request-Headers") || "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    ...extra,
  };
}

export function corsJsonResponseForRequest(
  request: Request,
  body: string,
  status = 200,
  methods = "GET, POST, OPTIONS",
) {
  return new Response(body, {
    status,
    headers: corsHeadersForRequest(request, methods),
  });
}

/**
 * Utility: Basic HTML escape for embedding text content safely
 */
export function escapeHtml(s: string): string {
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
export function extractPlainText(content: string): string {
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
export function formatConversationMarkdown(params: {
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
