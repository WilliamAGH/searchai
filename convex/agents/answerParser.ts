/**
 * Answer Parser
 * Extracts metadata and citations from raw answer text
 */

/**
 * Patterns to detect trailing source/reference sections the AI may add.
 * These duplicate our UI's source display and expose full URLs.
 */

/** Matches `## Sources` or `### References` heading followed by any content */
const MARKDOWN_HEADING_SOURCES = /\n#{1,3}\s*(?:Sources?|References?):?\s*\n[\s\S]*$/i;

/** Matches `**Sources:**` or `**References:**` bold header followed by any content */
const BOLD_HEADER_SOURCES = /\n\*\*(?:Sources?|References?)\*\*:?\s*\n[\s\S]*$/i;

/** Matches plain `Sources:` or `References:` followed by bullet/numbered list items */
const PLAIN_HEADER_SOURCES = /\n(?:Sources?|References?):?\s*\n(?:\s*[-•*\d]+\.?\s+.+(?:\n|$))+$/i;

const TRAILING_SOURCES_PATTERNS = [
  MARKDOWN_HEADING_SOURCES,
  BOLD_HEADER_SOURCES,
  PLAIN_HEADER_SOURCES,
];

/**
 * Strip trailing "Sources:" or "References:" sections that the AI may add.
 * These duplicate our UI's source display and show full URLs instead of domains.
 */
export function stripTrailingSources(text: string): string {
  let result = text;
  for (const pattern of TRAILING_SOURCES_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.trim();
}

/**
 * Parse citations from markdown text
 * Matches patterns like [domain.com] or [domain.com, domain2.com]
 */
export function extractCitations(text: string): string[] {
  const citations = new Set<string>();

  // Match [domain.com] or [domain1.com, domain2.com]
  const citationPattern = /\[([^\]]+)\]/g;
  let match;

  while ((match = citationPattern.exec(text)) !== null) {
    const citationContent = match[1];
    // Split by comma in case of multiple sources
    const domains = citationContent.split(",").map((d) => d.trim());

    for (const domain of domains) {
      // Basic validation - should look like a domain
      if (domain.includes(".") && !domain.includes(" ")) {
        citations.add(domain);
      }
    }
  }

  return Array.from(citations);
}

/**
 * Detect if the answer has a limitations section
 */
export function hasLimitationsSection(text: string): boolean {
  const limitationPatterns = [
    /\*\*Limitations?\*\*/i,
    /\*\*Ambiguities?\*\*/i,
    /\*\*Important Notes?\*\*/i,
    /\*\*Caveats?\*\*/i,
    /## Limitations?/i,
    /## Ambiguities?/i,
    /However, (it's worth noting|note that)/i,
    /It's important to note that/i,
  ];

  return limitationPatterns.some((pattern) => pattern.test(text));
}

/**
 * Extract limitations text if present
 */
export function extractLimitations(text: string): string | undefined {
  // Try to find a limitations section
  const limitationHeaderPatterns = [
    /\*\*Limitations?\*\*:?\s*/i,
    /\*\*Ambiguities?\*\*:?\s*/i,
    /\*\*Important Notes?\*\*:?\s*/i,
    /\*\*Caveats?\*\*:?\s*/i,
    /## Limitations?:?\s*/i,
    /## Ambiguities?:?\s*/i,
  ];

  for (const pattern of limitationHeaderPatterns) {
    const match = text.match(pattern);
    if (match) {
      const startIndex = match.index! + match[0].length;
      // Extract until the end or next major section
      const remainingText = text.slice(startIndex);
      const nextSectionMatch = remainingText.match(/\n##|$$/);
      const limitationText = nextSectionMatch
        ? remainingText.slice(0, nextSectionMatch.index).trim()
        : remainingText.trim();

      if (limitationText) {
        return limitationText;
      }
    }
  }

  return undefined;
}

/**
 * Assess answer completeness based on content
 */
export function assessCompleteness(text: string): "complete" | "partial" | "insufficient" {
  const hasLimitations = hasLimitationsSection(text);
  const wordCount = text.split(/\s+/).length;

  // Insufficient: very short or explicitly states insufficient info
  if (
    wordCount < 50 ||
    /I (could not|couldn't) find|insufficient information|no information available/i.test(text)
  ) {
    return "insufficient";
  }

  // Partial: has limitations or is relatively short
  if (hasLimitations || wordCount < 150) {
    return "partial";
  }

  // Complete: substantial answer without major limitations
  return "complete";
}

/**
 * Estimate confidence based on citations and content
 */
export function estimateConfidence(text: string, citations: string[]): number {
  let confidence = 0.5; // Base confidence

  // More citations = higher confidence
  if (citations.length >= 3) {
    confidence += 0.2;
  } else if (citations.length >= 2) {
    confidence += 0.15;
  } else if (citations.length >= 1) {
    confidence += 0.1;
  }

  // Confident language indicators
  if (/\b(definitely|certainly|clearly|confirmed)\b/i.test(text)) {
    confidence += 0.1;
  }

  // Hedging language reduces confidence
  if (/\b(might|maybe|possibly|appears to|seems to|likely)\b/i.test(text)) {
    confidence -= 0.1;
  }

  // Explicit uncertainty
  if (/\b(unclear|uncertain|unknown|unconfirmed)\b/i.test(text)) {
    confidence -= 0.15;
  }

  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Parse raw answer text and extract all metadata
 */
export interface ParsedAnswer {
  answer: string;
  hasLimitations: boolean;
  limitations: string | undefined;
  sourcesUsed: string[];
  answerCompleteness: "complete" | "partial" | "insufficient";
  confidence: number;
}

export function parseAnswerText(rawText: string): ParsedAnswer {
  const citations = extractCitations(rawText);
  const hasLimitations = hasLimitationsSection(rawText);
  const limitations = hasLimitations ? extractLimitations(rawText) : undefined;
  const completeness = assessCompleteness(rawText);
  const confidence = estimateConfidence(rawText, citations);

  return {
    answer: rawText.trim(),
    hasLimitations,
    limitations,
    sourcesUsed: citations,
    answerCompleteness: completeness,
    confidence,
  };
}
