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
 */
export function isTopicChange(
  currentMessage: string,
  previousMessage: string,
): boolean {
  if (!previousMessage) return false;
  const cur = (currentMessage || "").trim();
  const prev = (previousMessage || "").trim();
  if (cur.length < 10 || prev.length < 10) return false;

  // Length disparity guard (huge difference likely a change)
  const lenMax = Math.max(cur.length, prev.length);
  const lenDelta = Math.abs(cur.length - prev.length) / lenMax;

  // Token similarity
  const toksCur = normalize(cur);
  const toksPrev = normalize(prev);
  const jac = jaccard(toksCur, toksPrev);

  // Consider a change only if tokens barely overlap AND lengths differ enough
  // Thresholds tuned conservatively to avoid false positives on first turns
  return jac < 0.2 && lenDelta > 0.25;
}
