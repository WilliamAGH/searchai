import type { EnhancementRule } from "./types";

/**
 * Technical Documentation Enhancement
 */
export const technicalDocsEnhancement: EnhancementRule = {
  id: "technical-docs",
  name: "Technical Documentation Enhancement",
  description:
    "Improves queries about technical topics by adding documentation sites",
  enabled: true,
  priority: 2,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const techKeywords = [
      "how to",
      "tutorial",
      "documentation",
      "docs",
      "api",
      "sdk",
      "library",
      "framework",
      "install",
      "setup",
      "configure",
      "implement",
      "example",
      "sample code",
    ];

    return techKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    const lower = query.toLowerCase();
    if (lower.includes("react"))
      return `${query} site:react.dev OR site:github.com`;
    if (lower.includes("python"))
      return `${query} site:docs.python.org OR site:pypi.org`;
    if (lower.includes("javascript") || lower.includes("js"))
      return `${query} site:developer.mozilla.org`;
    return `${query} documentation official docs`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [...terms, "documentation", "official", "tutorial", "guide"];
  },
};

/**
 * Academic Research Enhancement
 */
const ACADEMIC_KEYWORD_PATTERNS: ReadonlyArray<RegExp> = [
  /\bresearch\b/i,
  /\bpapers?\b/i,
  /\bstud(y|ies)\b/i,
  /\bacademic\b/i,
  /\bjournals?\b/i,
  /\bpeer review(ed)?\b/i,
  /\bcitations?\b/i,
  /\bscholarly\b/i,
  /\bthes(is|es)\b/i,
  /\bdissertations?\b/i,
  /\bpublications?\b/i,
];

export const academicEnhancement: EnhancementRule = {
  id: "academic",
  name: "Academic & Research Enhancement",
  description: "Enhances academic queries with scholarly sources",
  enabled: true,
  priority: 4,

  matcher: (message: string) => {
    // Use word boundaries to avoid false positives like "Researchly" (product name).
    return ACADEMIC_KEYWORD_PATTERNS.some((p) => p.test(message));
  },

  enhanceQuery: (query: string) => {
    return `${query} site:scholar.google.com OR site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [...terms, "research", "paper", "study", "pdf"];
  },
};

/**
 * Code & Programming Enhancement
 */
export const codingEnhancement: EnhancementRule = {
  id: "coding",
  name: "Code & Programming Enhancement",
  description: "Enhances programming queries with Stack Overflow and GitHub",
  enabled: true,
  priority: 7,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const codeKeywords = [
      "code",
      "programming",
      "debug",
      "error",
      "bug",
      "function",
      "class",
      "method",
      "variable",
      "syntax",
      "typescript",
      "javascript",
      "python",
      "react",
      "node",
    ];

    return codeKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    return `${query} site:stackoverflow.com OR site:github.com OR site:developer.mozilla.org`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [...terms, "code", "example", "solution", "stackoverflow"];
  },
};
