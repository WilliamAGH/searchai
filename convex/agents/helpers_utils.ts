"use node";

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { normalizeUrl as normalizeUrlUtil } from "../lib/url";
import { isValidUuidV7 } from "../lib/uuid_validation";

// ============================================
// Constants and Utilities
// ============================================

export const isUuidV7 = (value: string | undefined): boolean =>
  !!value && isValidUuidV7(value);

/**
 * Convert numeric relevance score to human-readable label.
 * Uses centralized thresholds from RELEVANCE_SCORES constants.
 */
export function relevanceScoreToLabel(
  score: number | undefined,
): "high" | "medium" | "low" {
  const s = score ?? 0;
  if (s >= RELEVANCE_SCORES.HIGH_THRESHOLD) return "high";
  if (s >= RELEVANCE_SCORES.MEDIUM_THRESHOLD) return "medium";
  return "low";
}

export const normalizeUrl = normalizeUrlUtil;

export const truncate = (text: string, maxChars: number): string =>
  text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;

// ============================================
// Instant Response Detection
// ============================================

// Patterns for instant responses - no `i` flag needed since input is lowercased
const RESPONSES = {
  GREETING:
    "Hello! I'm ready to help you search and research any topic. What would you like to know?",
  TEST_CONFIRMATION:
    "Test confirmed! This chat is working. What would you like to research?",
} as const;

const INSTANT_RESPONSE_MAP: ReadonlyArray<{
  pattern: RegExp;
  response: string;
}> = [
  {
    pattern: /^(hi|hello|hey|howdy|greetings|yo)[\s!.,?]*$/,
    response: RESPONSES.GREETING,
  },
  {
    pattern: /^(good\s*(morning|afternoon|evening|night))[\s!.,?]*$/,
    response: RESPONSES.GREETING,
  },
  {
    pattern: /^(test|testing|this is a test|new chat|start)[\s!.,?]*$/,
    response: RESPONSES.TEST_CONFIRMATION,
  },
  {
    pattern: /^this is a new chat[\s!.,?]*$/,
    response: RESPONSES.TEST_CONFIRMATION,
  },
  {
    pattern: /^(thanks|thank you|thx|ty)[\s!.,?]*$/,
    response: "You're welcome! Let me know if you need anything else.",
  },
  {
    pattern: /^(bye|goodbye|see you|later|cya)[\s!.,?]*$/,
    response: "Goodbye! Feel free to start a new chat anytime.",
  },
  {
    pattern: /^(ok|okay|sure|yes|no|yep|nope|yeah|nah)[\s!.,?]*$/,
    response: "Got it. What would you like to know?",
  },
  {
    pattern: /^(help|help me|\?)[\s!.,?]*$/,
    response:
      "I'm a research assistant that can search the web and find information for you. Just ask me a question about any topic!",
  },
];

export function detectInstantResponse(query: string): string | null {
  const trimmed = query.trim().toLowerCase();
  const match = INSTANT_RESPONSE_MAP.find(({ pattern }) =>
    pattern.test(trimmed),
  );
  return match?.response ?? null;
}

// ============================================
// Error Stage Detection
// ============================================

const ERROR_STAGE_PATTERNS: ReadonlyArray<{ pattern: string; stage: string }> =
  [
    { pattern: "Planning failed", stage: "planning" },
    { pattern: "Research failed", stage: "research" },
    { pattern: "Synthesis failed", stage: "synthesis" },
  ];

export function detectErrorStage(
  error: unknown,
  isInstantPath: string | null,
): string {
  if (isInstantPath) {
    return "instant";
  }

  if (error instanceof Error) {
    const match = ERROR_STAGE_PATTERNS.find(({ pattern }) =>
      error.message.includes(pattern),
    );
    if (match) {
      return match.stage;
    }
  }

  return "unknown";
}

// ============================================
// Timeout Utilities
// ============================================

export class AgentTimeoutError extends Error {
  readonly stage: string;
  readonly timeoutMs: number;

  constructor(stage: string, timeoutMs: number) {
    super(`Agent ${stage} timed out after ${timeoutMs}ms`);
    this.name = "AgentTimeoutError";
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: string,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new AgentTimeoutError(stage, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}
