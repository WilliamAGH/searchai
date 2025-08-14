/**
 * Shared utility functions for chat operations
 */

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
  const sanitize = (s?: string) => (s || "").replace(/\s+/g, " ").trim();
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
 * Generate a URL-safe opaque ID using UUID v7
 * Provides time-sortable, collision-resistant identifiers
 * @deprecated Use specific generators from convex/lib/uuid.ts instead
 */
export { generateOpaqueId } from "../lib/uuid";
