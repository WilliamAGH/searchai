// Minimal topic detection utilities for frontend

// Simple stopword list for heuristic similarity
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "to",
  "of",
  "and",
  "or",
  "in",
  "on",
  "for",
  "with",
  "as",
  "by",
  "at",
  "this",
  "that",
  "these",
  "those",
  "it",
  "be",
  "was",
  "were",
  "from",
  "about",
  "into",
  "over",
  "under",
  "you",
  "your",
  "yours",
  "my",
  "mine",
  "we",
  "our",
  "they",
  "their",
  "them",
  "he",
  "she",
  "his",
  "her",
]);

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Heuristic topic change detector between two user messages.
 * - Ignores stopwords and punctuation
 * - Uses Jaccard similarity with length guards
 * - Only flags change on substantial difference
 * - Recognizes contextual follow-ups like "What about X?"
 */
export function isTopicChange(currentMessage: string, previousMessage: string): boolean {
  if (!previousMessage) return false;
  const cur = (currentMessage || "").trim().toLowerCase();
  const prev = (previousMessage || "").trim().toLowerCase();

  // Too short to determine
  if (cur.length < 10 || prev.length < 10) return false;

  // Check for contextual follow-up patterns
  const followUpPatterns = [
    /^what about/i,
    /^how about/i,
    /^and \w+\?/i,
    /^similarly/i,
    /^likewise/i,
    /^also/i,
    /^in the same way/i,
    /^same question/i,
    /^same for/i,
  ];

  // If message starts with a follow-up pattern, it's likely continuing the topic
  if (followUpPatterns.some((pattern) => pattern.test(cur))) {
    return false; // NOT a topic change
  }

  // Check for explicit topic change indicators
  const topicChangePatterns = [
    /^(let'?s |can we |could we |i want to )?(change|switch|move|talk about|discuss)/i,
    /^(on )?(another|different|new|separate) (topic|subject|question|note)/i,
    /^(anyway|anyways|moving on|by the way|btw)/i,
  ];

  if (topicChangePatterns.some((pattern) => pattern.test(cur))) {
    return true; // IS a topic change
  }

  // Length disparity guard (huge difference might indicate a change)
  const lenMax = Math.max(cur.length, prev.length);
  const lenDelta = Math.abs(cur.length - prev.length) / lenMax;

  // Token similarity
  const toksCur = normalize(currentMessage);
  const toksPrev = normalize(previousMessage);
  const jac = jaccard(toksCur, toksPrev);

  // Consider a change if:
  // 1. Tokens have very low overlap (completely different topics)
  // 2. OR significant length difference with some topic divergence
  // More nuanced to catch actual topic changes
  if (jac < 0.1) return true; // Almost no common words = topic change
  if (jac < 0.2 && lenDelta > 0.5) return true; // Low overlap + big length diff
  return false; // Default to assuming continuation
}
