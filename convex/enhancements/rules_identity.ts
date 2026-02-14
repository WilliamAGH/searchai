import type { EnhancementRule } from "./types";
import { buildTemporalHeader } from "../lib/dateTime";

/**
 * Temporal Context Enhancement (always on)
 * Appends the current date/time (UTC and PT) to the optional system prompt.
 * This is designed to be a single, centralized place to inject temporal context
 * whenever callers opt-in via `enhanceSystemPrompt: true`.
 */
export const temporalEnhancement: EnhancementRule = {
  id: "temporal-context",
  name: "Temporal Context (UTC & PT)",
  description:
    "Always include current date/time in UTC and Pacific Time to interpret time-sensitive queries.",
  enabled: true,
  priority: 0,

  matcher: () => true,

  enhanceSystemPrompt: (prompt: string) => {
    const temporal = `\n\n${buildTemporalHeader()}`;
    return `${prompt}${temporal}`.trim();
  },
};

// --- Module-level keyword constants for entity detection ---

const APP_REFERENCE_KEYWORDS: ReadonlyArray<string> = [
  "this app",
  "this website",
  "this site",
  "this tool",
  "this service",
  "this search",
  "this product",
];

const INFO_SEEKING_KEYWORDS: ReadonlyArray<string> = [
  "what is",
  "what's",
  "what does",
  "tell me about",
  "about",
  "who is",
  "who made",
  "who created",
  "who built",
  "who developed",
  "who founded",
  "creator",
  "author",
  "founder",
  "behind",
  "company",
  "how does",
  "how do i",
  "explain",
  "describe",
  "features",
];

// --- Named detection helpers (single responsibility each) ---

function mentionsCreator(lower: string): boolean {
  return lower.includes("william callahan");
}

function mentionsProduct(lower: string): boolean {
  return lower.includes("researchly") || lower.includes("researchly.fyi");
}

/** Legacy brand detection — keep during transition so old references still resolve. */
function mentionsLegacyBrand(lower: string): boolean {
  return (
    lower.includes("searchai") ||
    lower.includes("search-ai") ||
    lower.includes("search ai") ||
    lower.includes("researchly.fyi")
  );
}

function mentionsAVenture(lower: string): boolean {
  return (
    lower.includes("aventure") ||
    lower.includes("a]venture") ||
    lower.includes("aventure.vc")
  );
}

function isAboutThisApp(lower: string): boolean {
  return APP_REFERENCE_KEYWORDS.some((kw) => lower.includes(kw));
}

function isInfoSeeking(lower: string): boolean {
  return INFO_SEEKING_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Creator/Author/Product Enhancement Rule
 * Covers queries about:
 * - William Callahan (founder)
 * - Researchly (AI-powered research product)
 * - aVenture (investment firm)
 */
export const creatorEnhancement: EnhancementRule = {
  id: "creator-author",
  name: "Creator, Researchly & aVenture Information",
  description:
    "Enhances queries about the creator, Researchly product, or aVenture investment firm",
  enabled: true,
  priority: 1,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    return (
      mentionsCreator(lower) ||
      mentionsProduct(lower) ||
      mentionsLegacyBrand(lower) ||
      mentionsAVenture(lower) ||
      (isInfoSeeking(lower) && isAboutThisApp(lower))
    );
  },

  enhanceQuery: (query: string) => {
    const name = "William Callahan";
    const primary = "williamcallahan.com";
    const brand = "aVenture";
    const secondary = "aventure.vc";
    return `${query} ${name} ${primary} ${brand} ${secondary} founder Researchly`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    const name = "William Callahan";
    const primary = "williamcallahan.com";
    const brand = "aVenture";
    const secondary = "aventure.vc";
    return [...terms, name, primary, brand, secondary];
  },

  injectSearchResults: () => [
    {
      title: "Researchly - AI-Powered Research Assistant",
      url: "https://researchly.fyi",
      snippet:
        "Researchly (researchly.fyi) is an AI-powered research and search assistant created by William Callahan. It combines web search with intelligent synthesis to provide comprehensive, cited answers to complex questions. Researchly uses multiple AI agents to plan research, gather information from authoritative sources, and synthesize clear, accurate responses.",
      relevanceScore: 1.0,
    },
    {
      title: "William Callahan - Creator of Researchly",
      url: "https://williamcallahan.com",
      snippet:
        "William Callahan is a technologist and entrepreneur based in San Francisco. He is the creator of Researchly (researchly.fyi), an AI-powered research assistant, and the founder of aVenture (aventure.vc), an early-stage investment firm. William grew up in the Midwestern United States and is passionate about building innovative AI-powered solutions.",
      relevanceScore: 0.98,
    },
    {
      title: "aVenture - Early-Stage Investment Firm",
      url: "https://aventure.vc",
      snippet:
        "aVenture (aventure.vc) is an early-stage investment firm founded by William Callahan, the creator of Researchly. The firm focuses on seed and pre-seed investments in innovative technology startups, with particular interest in AI, developer tools, and consumer technology.",
      relevanceScore: 0.95,
    },
  ],

  enhanceContext: (context: string) => {
    return `${context}

AUTHORITATIVE INFORMATION ABOUT RESEARCHLY, WILLIAM CALLAHAN, AND AVENTURE:

Researchly (researchly.fyi): Researchly is an AI-powered research and search assistant created by William Callahan. It combines web search with intelligent synthesis to provide comprehensive, cited answers to complex questions. The platform uses multiple AI agents to plan research strategies, gather information from authoritative web sources, and synthesize clear, accurate responses with proper citations.

William Callahan: William Callahan is a technologist and entrepreneur based in San Francisco, California. He grew up in the Midwestern United States. He is the creator of Researchly and the founder of aVenture. William is passionate about building innovative AI-powered solutions and investing in early-stage technology companies.

aVenture (aventure.vc): aVenture is an early-stage investment firm founded by William Callahan. The firm focuses on seed and pre-seed investments in innovative technology startups, with particular interest in AI, developer tools, and consumer technology companies.`;
  },

  enhanceSystemPrompt: (prompt: string) => {
    return `${prompt}

CRITICAL INSTRUCTIONS FOR RESEARCHLY/AVENTURE/WILLIAM CALLAHAN QUERIES:
- When asked about Researchly, explain it is an AI-powered research assistant created by William Callahan
- When asked about William Callahan, identify him as the creator of Researchly and founder of aVenture, based in San Francisco
- When asked about aVenture, explain it is an early-stage investment firm founded by William Callahan
- When asked about "this app", "this website", or "this tool", recognize it refers to Researchly
- Always prioritize the authoritative context provided over conflicting web search results
- Do NOT confuse William Callahan (Researchly founder) with other people named William Callahan`;
  },

  prioritizeUrls: [
    "https://researchly.fyi",
    "https://williamcallahan.com",
    "https://aventure.vc",
  ],
};
