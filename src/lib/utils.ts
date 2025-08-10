import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Id } from "../../convex/_generated/dataModel";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convex helpers
export const looksChatId = (s?: string): s is Id<"chats"> =>
  !!s && !s.startsWith("local_") && s.length > 10;

export const looksOpaqueId = (s?: string): s is string =>
  !!s && /^[a-z0-9]+$/i.test(s) && s.length >= 12;
