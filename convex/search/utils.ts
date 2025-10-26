/**
 * Search utilities for text processing and entity extraction
 */

// Test-only helpers (no production references). Kept minimal and standalone.
export function __testTokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function __testSerialize(s?: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

// Extract keywords for testing
export function __extractKeywordsForTest(text: string, max: number): string[] {
  const freq = new Map<string, number>();
  for (const tok of __testTokenize(text)) {
    if (tok.length < 4) continue;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }
  const limit = Math.max(1, max | 0);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export function __augmentQueryForTest(
  q: string,
  kws: string[],
  maxExtras: number,
): string {
  const base = __testSerialize(q);
  const words = new Set(__testTokenize(base));
  const extras: string[] = [];
  const cap = Math.max(1, maxExtras | 0);
  for (const k of kws || []) {
    if (!words.has(k) && extras.length < cap) extras.push(k);
  }
  const combined = extras.length ? `${base} ${extras.join(" ")}` : base;
  return combined.slice(0, 220);
}

// Extract key entities (companies, locations, products) from context
export function extractKeyEntities(context: string): string[] {
  if (!context) return [];

  const entities: string[] = [];

  // Common company names pattern
  const companyPattern =
    /\b(Apple|Google|Microsoft|Amazon|Facebook|Meta|Tesla|OpenAI|Anthropic|IBM|Oracle|Samsung|Sony|Netflix|Twitter|X|SpaceX)\b/gi;
  const companies = context.match(companyPattern);
  if (companies) {
    entities.push(...companies.map((c) => c.toLowerCase()));
  }

  // Locations (cities, states, countries)
  const locationPattern =
    /\b(Cupertino|California|Silicon Valley|Mountain View|Seattle|Austin|Texas|Cork|Ireland|Singapore|Shanghai|China|United States|USA)\b/gi;
  const locations = context.match(locationPattern);
  if (locations) {
    entities.push(...locations.map((l) => l.toLowerCase()));
  }

  // Technical terms and products that might be relevant
  const techPattern =
    /\b(headquarters|HQ|office|campus|based|located|founded|CEO|founder|product|service|cloud|AI|machine learning)\b/gi;
  const techTerms = context.match(techPattern);
  if (techTerms && techTerms.length < 3) {
    entities.push(...techTerms.map((t) => t.toLowerCase()));
  }

  // Remove duplicates and return most relevant entities
  return [...new Set(entities)].slice(0, 5);
}

// Text processing utilities
export function serialize(s: string | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function tokenize(t: string): string[] {
  return t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function tokSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

export function jaccard(A: Set<string>, B: Set<string>): number {
  const inter = new Set([...A].filter((x) => B.has(x))).size;
  const uni = new Set([...A, ...B]).size || 1;
  return inter / uni;
}

// MMR (Maximal Marginal Relevance) diversification
export function diversifyQueries(
  pool: string[],
  referenceQuery: string,
  maxQueries: number = 4,
  lambda: number = 0.7,
): string[] {
  const Q = tokSet(referenceQuery);
  const selected: string[] = [];
  const used = new Set<number>();

  while (selected.length < Math.min(maxQueries, pool.length)) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const cand = pool[i];
      const C = tokSet(cand);
      const rel = jaccard(C, Q);
      let nov = 1;
      for (const s of selected) {
        nov = Math.min(nov, 1 - jaccard(C, tokSet(s)));
      }
      const score = lambda * rel + (1 - lambda) * nov;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    used.add(bestIdx);
    selected.push(pool[bestIdx]);
  }

  return selected;
}
