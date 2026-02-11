/**
 * Shared utility functions for chat operations
 */

import { normalizeWhitespace } from "../lib/text";

/**
 * Build a compact context summary from messages
 * Used by planner to reduce token usage
 */
export function buildContextSummary(params: {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    timestamp?: number;
  }>;
  rollingSummary?: string;
  maxChars?: number;
}): string {
  const { messages, rollingSummary, maxChars = 1600 } = params;
  const sanitize = normalizeWhitespace;
  const recent = messages.slice(-14); // cap to last 14 turns for cost

  // Collect last 2 user turns verbatim (truncated), then last assistant, then compact older
  const lastUsers = [...recent]
    .reverse()
    .filter((m) => m.role === "user")
    .slice(0, 2)
    .reverse();
  const lastAssistant = [...recent]
    .reverse()
    .find((m) => m.role === "assistant");

  const lines: string[] = [];
  if (rollingSummary) {
    lines.push(sanitize(rollingSummary).slice(0, 800));
  }
  for (const m of lastUsers) {
    const txt = sanitize(m.content).slice(0, 380);
    if (txt) lines.push(`User: ${txt}`);
  }
  if (lastAssistant) {
    const txt = sanitize(lastAssistant.content).slice(0, 380);
    if (txt) lines.push(`Assistant: ${txt}`);
  }
  // Add compact one-liners for the rest, oldest to newest, skipping ones already included
  const included = new Set(lines);
  for (const m of recent) {
    const txt = sanitize(m.content);
    if (!txt) continue;
    const line = `${m.role === "assistant" ? "Assistant" : m.role === "user" ? "User" : "System"}: ${txt.slice(0, 220)}`;
    if (!included.has(line)) {
      lines.push(line);
    }
    if (lines.join("\n").length >= maxChars) break;
  }
  return lines.join("\n").slice(0, maxChars);
}

/**
 * CRITICAL: This is the ONLY place where chat titles are generated.
 * All chat titles in the entire application use this 25 character limit.
 * DO NOT create alternative title generation functions.
 */
const DEFAULT_TITLE_MAX_LENGTH = 25;

/**
 * Generate a concise chat title from user intent/message
 *
 * SINGLE SOURCE OF TRUTH for all chat title generation.
 * - Default max length: 25 characters (used everywhere in the app)
 * - Removes filler words ("what is the", "tell me about", etc.)
 * - Smart word-boundary truncation
 * - Capitalizes first letter
 *
 * Frontend (src/lib/types/unified.ts:TitleUtils) only provides sanitization,
 * NOT generation. All title generation happens here.
 */
export function generateChatTitle(params: {
  intent: string;
  maxLength?: number;
}): string {
  const { intent, maxLength = DEFAULT_TITLE_MAX_LENGTH } = params;
  if (!intent) return "New Chat";

  const sanitized = normalizeWhitespace(intent.replace(/<+/g, ""));
  if (!sanitized) return "New Chat";

  // Remove common filler words/phrases to make titles more concise
  const fillerWords = [
    "understand the",
    "explain the",
    "what is the",
    "tell me about",
    "how do i",
    "can you",
    "please",
    "definition of",
    "meaning of",
  ];

  let compressed = sanitized.toLowerCase();
  for (const filler of fillerWords) {
    compressed = compressed.replace(new RegExp(`^${filler}\\s+`, "i"), "");
  }
  compressed = compressed.trim();

  // Capitalize first letter
  if (compressed) {
    compressed = compressed.charAt(0).toUpperCase() + compressed.slice(1);
  } else {
    compressed = sanitized;
  }

  if (compressed.length <= maxLength) return compressed;

  // Smart truncation at word boundary
  const truncated = compressed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength / 2)) {
    return `${truncated.slice(0, lastSpace)}...`;
  }
  return `${truncated}...`;
}
