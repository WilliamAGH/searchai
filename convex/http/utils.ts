/**
 * Utility functions for HTTP endpoints
 */

import { extractPlainText } from "../lib/text";
import type { WebResearchSource } from "../lib/validators";

/**
 * Serialize an error for JSON responses
 * - Extracts name, message, stack, and cause from Error objects
 * - Converts non-Error values to string messages
 */
export function serializeError(error: unknown) {
  if (error instanceof Error) {
    // Safely extract cause - handle both Error and primitive causes
    const cause = (error as Error & { cause?: unknown }).cause;
    let causeStr: string | undefined;
    if (cause instanceof Error) {
      causeStr = cause.message;
    } else if (typeof cause === "string") {
      causeStr = cause;
    } else if (cause !== undefined) {
      // For non-string, non-Error causes, try JSON or skip
      try {
        causeStr = JSON.stringify(cause);
      } catch {
        causeStr = "[unserializable cause]";
      }
    }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: causeStr,
    };
  }
  // Handle string errors
  if (typeof error === "string") {
    return { message: error };
  }
  // For other types, try to extract a message or stringify
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return { message: error.message };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: "[unserializable error]" };
  }
}

// Gate verbose logs in production
export const DEBUG_HTTP = process.env.DEBUG_HTTP === "1";
export const dlog = (...args: unknown[]) => {
  if (DEBUG_HTTP) console.info(...args);
};

/**
 * Format a Server-Sent Event line for JSON payloads.
 */
export function formatSseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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
 * Utility: Format conversation as Markdown with web research sources.
 */
export function formatConversationMarkdown(params: {
  title?: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    webResearchSources?: WebResearchSource[] | undefined;
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
      if (Array.isArray(m.webResearchSources)) {
        for (const s of m.webResearchSources) {
          if (!s || typeof s.url !== "string" || s.url.length === 0) continue;
          if (seen.has(s.url)) continue;
          seen.add(s.url);
          if (s.title) src.push(`- ${s.title}: ${s.url}`);
          else src.push(`- ${s.url}`);
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
