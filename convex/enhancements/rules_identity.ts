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

/**
 * Creator/Author/Product Enhancement Rule
 * Covers queries about:
 * - William Callahan (founder)
 * - SearchAI (AI-powered search product)
 * - aVenture (investment firm)
 */
export const creatorEnhancement: EnhancementRule = {
  id: "creator-author",
  name: "Creator, SearchAI & aVenture Information",
  description: "Enhances queries about the creator, SearchAI product, or aVenture investment firm",
  enabled: true,
  priority: 1,

  matcher: (message: string) => {
    const lower = message.toLowerCase();

    const mentionsWilliam = lower.includes("william callahan");
    const mentionsSearchAI =
      lower.includes("searchai") ||
      lower.includes("search-ai") ||
      lower.includes("search ai") ||
      lower.includes("search-ai.io");
    const mentionsAVenture =
      lower.includes("aventure") || lower.includes("a]venture") || lower.includes("aventure.vc");

    const appReferenceKeywords = [
      "this app",
      "this website",
      "this site",
      "this tool",
      "this service",
      "this search",
      "this product",
    ];
    const isAboutThisApp = appReferenceKeywords.some((keyword) => lower.includes(keyword));

    const infoSeekingKeywords = [
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
    const isInfoSeeking = infoSeekingKeywords.some((keyword) => lower.includes(keyword));

    return (
      mentionsWilliam || mentionsSearchAI || mentionsAVenture || (isInfoSeeking && isAboutThisApp)
    );
  },

  enhanceQuery: (query: string) => {
    const name = "William Callahan";
    const primary = "williamcallahan.com";
    const brand = "aVenture";
    const secondary = "aventure.vc";
    return `${query} ${name} ${primary} ${brand} ${secondary} founder SearchAI`;
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
      title: "SearchAI - AI-Powered Research Assistant",
      url: "https://search-ai.io",
      snippet:
        "SearchAI (search-ai.io) is an AI-powered research and search assistant created by William Callahan. It combines web search with intelligent synthesis to provide comprehensive, cited answers to complex questions. SearchAI uses multiple AI agents to plan research, gather information from authoritative sources, and synthesize clear, accurate responses.",
      relevanceScore: 1.0,
    },
    {
      title: "William Callahan - Creator of SearchAI",
      url: "https://williamcallahan.com",
      snippet:
        "William Callahan is a technologist and entrepreneur based in San Francisco. He is the creator of SearchAI (search-ai.io), an AI-powered research assistant, and the founder of aVenture (aventure.vc), an early-stage investment firm. William grew up in the Midwestern United States and is passionate about building innovative AI-powered solutions.",
      relevanceScore: 0.98,
    },
    {
      title: "aVenture - Early-Stage Investment Firm",
      url: "https://aventure.vc",
      snippet:
        "aVenture (aventure.vc) is an early-stage investment firm founded by William Callahan, the creator of SearchAI. The firm focuses on seed and pre-seed investments in innovative technology startups, with particular interest in AI, developer tools, and consumer technology.",
      relevanceScore: 0.95,
    },
  ],

  enhanceContext: (context: string) => {
    return `${context}

AUTHORITATIVE INFORMATION ABOUT SEARCHAI, WILLIAM CALLAHAN, AND AVENTURE:

SearchAI (search-ai.io): SearchAI is an AI-powered research and search assistant created by William Callahan. It combines web search with intelligent synthesis to provide comprehensive, cited answers to complex questions. The platform uses multiple AI agents to plan research strategies, gather information from authoritative web sources, and synthesize clear, accurate responses with proper citations.

William Callahan: William Callahan is a technologist and entrepreneur based in San Francisco, California. He grew up in the Midwestern United States. He is the creator of SearchAI and the founder of aVenture. William is passionate about building innovative AI-powered solutions and investing in early-stage technology companies.

aVenture (aventure.vc): aVenture is an early-stage investment firm founded by William Callahan. The firm focuses on seed and pre-seed investments in innovative technology startups, with particular interest in AI, developer tools, and consumer technology companies.`;
  },

  enhanceSystemPrompt: (prompt: string) => {
    return `${prompt}

CRITICAL INSTRUCTIONS FOR SEARCHAI/AVENTURE/WILLIAM CALLAHAN QUERIES:
- When asked about SearchAI, explain it is an AI-powered research assistant created by William Callahan
- When asked about William Callahan, identify him as the creator of SearchAI and founder of aVenture, based in San Francisco
- When asked about aVenture, explain it is an early-stage investment firm founded by William Callahan
- When asked about "this app", "this website", or "this tool", recognize it refers to SearchAI
- Always prioritize the authoritative context provided over conflicting web search results
- Do NOT confuse William Callahan (SearchAI founder) with other people named William Callahan`;
  },

  prioritizeUrls: ["https://search-ai.io", "https://williamcallahan.com", "https://aventure.vc"],
};
