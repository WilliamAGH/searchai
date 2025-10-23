import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Id } from "../../convex/_generated/dataModel";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  if (params.title) lines.push(`# ${params.title}`, "");
  for (const m of params.messages) {
    const role =
      m.role === "user"
        ? "User"
        : m.role === "assistant"
          ? "Assistant"
          : "System";
    lines.push(`${role}: ${m.content ?? ""}`);
    if (m.role === "assistant") {
      const src: string[] = [];
      const seen = new Set<string>();
      if (Array.isArray(m.searchResults)) {
        for (const r of m.searchResults) {
          if (!r || !r.url) continue;
          const key = r.url;
          if (seen.has(key)) continue;
          seen.add(key);
          if (r.title) src.push(`- [${r.title}](${r.url})`);
          else src.push(`- [${r.url}](${r.url})`);
        }
      }
      if (Array.isArray(m.sources)) {
        for (const u of m.sources) {
          if (!u || seen.has(u)) continue;
          seen.add(u);
          src.push(`- [${u}](${u})`);
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

// Convex helpers
export const looksChatId = (s?: string): s is Id<"chats"> =>
  !!s && !s.startsWith("local_") && s.length > 10;

export const looksOpaqueId = (s?: string): s is string =>
  !!s && /^[a-z0-9]+$/i.test(s) && s.length >= 12;

/**
 * Debounce function to limit how often a function can be called
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to ensure a function is called at most once per interval
 * @param func - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Check if an element is near the bottom of its scroll container
 * @param element - Scrollable element
 * @param threshold - Distance from bottom in pixels
 * @returns True if near bottom
 */
export function isNearBottom(
  element: HTMLElement | null,
  threshold: number,
): boolean {
  if (!element) return false;
  const { scrollTop, scrollHeight, clientHeight } = element;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

/**
 * Check if an element is at the bottom of its scroll container
 * @param element - Scrollable element
 * @param tolerance - Tolerance in pixels (default: 1)
 * @returns True if at bottom
 */
export function isAtBottom(
  element: HTMLElement | null,
  tolerance = 1,
): boolean {
  if (!element) return false;
  const { scrollTop, scrollHeight, clientHeight } = element;
  return Math.abs(scrollHeight - scrollTop - clientHeight) <= tolerance;
}
