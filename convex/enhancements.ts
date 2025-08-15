/**
 * Message Enhancement System
 * Provides comprehensive interception and quality improvements for:
 * - User queries
 * - Search requests
 * - Search results
 * - Context building
 * - AI responses
 */

// Import SearchResult from the single source of truth
import type { SearchResult } from "./search/providers/serpapi";

// Enhancement system - no convex values needed here

// Extract URLs and domains from user message
export function extractUrlsFromMessage(message: string): string[] {
  // Regex to match:
  // 1) http/https URLs up to whitespace or closing paren
  // 2) www.* domains
  // 3) bare domains with TLDs, allowing subdomains
  const urlRegex =
    /(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+)|(www\.[^\s)]+)|\b([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=\/|\b)/g;
  const matches = message.match(urlRegex) || [];

  const urls: string[] = [];
  for (let raw of matches) {
    // Strip surrounding quotes and trailing punctuation/parentheses
    raw = raw.replace(/^['"(]+/, "").replace(/[)\].,!?]+$/, "");

    if (raw.startsWith("http")) {
      urls.push(raw);
    } else if (raw.startsWith("www.")) {
      urls.push(`https://${raw}`);
    } else {
      urls.push(`https://${raw}`);
    }
  }

  // Deduplicate and normalize
  const deduped = Array.from(new Set(urls));
  return deduped;
}

// Create search results from user-provided URLs
export function createUserProvidedSearchResults(
  urls: string[],
): SearchResult[] {
  return urls.map((url) => {
    try {
      const parsedUrl = new URL(url);
      return {
        title: `User-provided source: ${parsedUrl.hostname}`,
        url: url,
        snippet: "Source explicitly mentioned by user in their query",
        relevanceScore: 0.95, // High relevance score to prioritize these sources
      };
    } catch {
      // If URL parsing fails, return a minimal result
      return {
        title: `User-provided source: ${url}`,
        url: url,
        snippet: "Source explicitly mentioned by user in their query",
        relevanceScore: 0.95,
      };
    }
  });
}

/**
 * Enhancement rule that can modify various aspects of the message pipeline
 */
export interface EnhancementRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // Lower numbers = higher priority

  // Matchers
  matcher: (message: string) => boolean;

  // Enhancements
  enhanceQuery?: (query: string) => string;
  enhanceSearchTerms?: (terms: string[]) => string[];
  injectSearchResults?: () => SearchResult[];
  enhanceContext?: (context: string) => string;
  enhanceSystemPrompt?: (prompt: string) => string;
  enhanceResponse?: (content: string) => string;
  prioritizeUrls?: string[];
}

// SearchResult is imported from ./search/providers/serpapi above

/**
 * Creator/Author Enhancement Rule
 */
const creatorEnhancement: EnhancementRule = {
  id: "creator-author",
  name: "Creator & Author Information",
  description:
    "Enhances queries about the creator, author, or company behind SearchAI",
  enabled: true,
  priority: 1,

  matcher: (message: string) => {
    const lower = message.toLowerCase();

    // More specific creator-related keywords that won't match generic queries
    const creatorKeywords = [
      "creator",
      "author",
      "founder",
      "who made",
      "who created",
      "who built",
      "who developed",
      "behind",
      "company",
      "william callahan",
      "who founded",
      // Removed "who is" - too generic and was causing false positives
    ];

    const appKeywords = [
      "searchai",
      "search-ai",
      "search ai",
      "search-ai.io",
      "this app",
      "this website",
      "this site",
      "this tool",
      "this service",
      "this search",
    ];

    const mentionsWilliam = lower.includes("william callahan");
    const isAboutCreator = creatorKeywords.some((keyword) =>
      lower.includes(keyword),
    );
    const isAboutApp =
      appKeywords.some((keyword) => lower.includes(keyword)) ||
      lower.includes("searchai") ||
      lower.includes("search-ai") ||
      lower.includes("search ai");

    // Additional safeguard: check if the query is actually about SearchAI or its creator
    // This prevents false positives on generic questions like "what is a mac?"
    const isGenericQuestion =
      lower.startsWith("what is") ||
      lower.startsWith("how to") ||
      lower.startsWith("where is") ||
      lower.startsWith("when is") ||
      lower.startsWith("why is") ||
      lower.includes("definition") ||
      lower.includes("meaning");

    // More restrictive logic: only trigger on specific creator/app questions
    // Not on generic "what is X" or "how to" questions
    return (
      (mentionsWilliam || (isAboutCreator && isAboutApp)) && !isGenericQuestion
    );
  },

  enhanceQuery: (query: string) => {
    // Hard-coded values since Convex functions don't have access to process.env
    const name = "William Callahan";
    const primary = "williamcallahan.com";
    const brand = "aVenture";
    const secondary = "aventure.vc";

    const enhanced = `${query} ${name} ${primary} ${brand} ${secondary} founder SearchAI`;

    // Log when this enhancement is applied for debugging
    console.info("🔧 Creator enhancement applied to query:", {
      original: query,
      enhanced,
    });

    return enhanced;
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
      title: "William Callahan - Creator of SearchAI",
      url: "https://williamcallahan.com",
      snippet:
        "William Callahan is the creator of SearchAI (search-ai.io) and founder of aVenture (aventure.vc). Based in San Francisco, William grew up in the Midwestern United States and is passionate about building innovative AI-powered search solutions.",
      relevanceScore: 1.0,
    },
    {
      title: "aVenture - Investment Firm by William Callahan",
      url: "https://aventure.vc",
      snippet:
        "aVenture is an investment firm founded by William Callahan, the creator of SearchAI. The firm focuses on early-stage technology investments and innovative startups.",
      relevanceScore: 0.95,
    },
  ],

  enhanceContext: (context: string) => {
    return `${context}\n\nImportant: William Callahan is the creator of SearchAI (search-ai.io) and founder of aVenture (https://aventure.vc). He lives in San Francisco and grew up in the Midwestern United States.`;
  },

  enhanceSystemPrompt: (prompt: string) => {
    return `${prompt}\n\nWhen asked about the creator, author, or company behind SearchAI, this app, or this website, always mention William Callahan and provide details about being the creator of SearchAI and founder of aVenture.`;
  },

  prioritizeUrls: ["https://williamcallahan.com", "https://aventure.vc"],
};

/**
 * Technical Documentation Enhancement
 */
const technicalDocsEnhancement: EnhancementRule = {
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
 * Current Events Enhancement
 */
const currentEventsEnhancement: EnhancementRule = {
  id: "current-events",
  name: "Current Events & News Enhancement",
  description: "Adds recency and news sources for current event queries",
  enabled: true,
  priority: 3,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const currentKeywords = [
      "latest",
      "recent",
      "today",
      "news",
      "current",
      "update",
      "announcement",
      "breaking",
      "new",
    ];

    return currentKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    const year = new Date().getFullYear();
    // Only add year if it's not already present
    if (!query.includes(year.toString())) {
      return `${query} ${year}`;
    }
    return query;
  },

  enhanceSearchTerms: (terms: string[]) => {
    const year = new Date().getFullYear().toString();
    // Only add year if it's not already present
    if (!terms.includes(year)) {
      return [...terms, year];
    }
    return terms;
  },
};

/**
 * Academic Research Enhancement
 */
const academicEnhancement: EnhancementRule = {
  id: "academic",
  name: "Academic & Research Enhancement",
  description: "Enhances academic queries with scholarly sources",
  enabled: true,
  priority: 4,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const academicKeywords = [
      "research",
      "paper",
      "study",
      "academic",
      "journal",
      "peer review",
      "citation",
      "scholarly",
      "thesis",
      "dissertation",
      "publication",
    ];

    return academicKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    return `${query} site:scholar.google.com OR site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [...terms, "research", "paper", "study", "pdf"];
  },
};

/**
 * Product Comparison Enhancement
 */
const comparisonEnhancement: EnhancementRule = {
  id: "comparison",
  name: "Product & Service Comparison",
  description:
    "Enhances comparison queries with review sites and versus searches",
  enabled: true,
  priority: 5,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const comparisonKeywords = [
      "vs",
      "versus",
      "compare",
      "comparison",
      "better",
      "difference between",
      "which is",
      "alternatives to",
      "similar to",
      "like",
    ];

    return comparisonKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    return `${query} comparison review versus alternatives pros cons`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [...terms, "comparison", "versus", "review", "alternatives"];
  },
};

/**
 * Local Information Enhancement
 */
const localInfoEnhancement: EnhancementRule = {
  id: "local",
  name: "Local Information Enhancement",
  description: "Enhances queries about local businesses and services",
  enabled: true,
  priority: 6,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const localKeywords = [
      "near me",
      "nearby",
      "local",
      "in my area",
      "around here",
      "closest",
      "san francisco",
      "sf",
      "bay area",
      "silicon valley",
    ];

    return localKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    const lower = query.toLowerCase();
    // Default to San Francisco if no specific location mentioned
    if (
      !lower.includes("san francisco") &&
      !lower.includes("sf") &&
      !lower.includes("bay area") &&
      !lower.includes("silicon valley")
    ) {
      return `${query} San Francisco Bay Area`;
    }
    return `${query} location hours address phone`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [...terms, "San Francisco", "location", "address", "hours"];
  },
};

/**
 * Code & Programming Enhancement
 */
const codingEnhancement: EnhancementRule = {
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

/**
 * Health & Medical Enhancement (with disclaimer)
 */
const healthEnhancement: EnhancementRule = {
  id: "health",
  name: "Health & Medical Information",
  description: "Enhances health queries with reputable sources and disclaimer",
  enabled: true,
  priority: 8,

  matcher: (message: string) => {
    const lower = message.toLowerCase();
    const healthKeywords = [
      "symptom",
      "treatment",
      "medicine",
      "health",
      "medical",
      "doctor",
      "disease",
      "condition",
      "diagnosis",
      "therapy",
    ];

    return healthKeywords.some((keyword) => lower.includes(keyword));
  },

  enhanceQuery: (query: string) => {
    return `${query} site:mayoclinic.org OR site:webmd.com OR site:nih.gov OR site:cdc.gov`;
  },

  enhanceSystemPrompt: (prompt: string) => {
    return `${prompt}\n\nIMPORTANT: For health-related queries, always include a disclaimer that the information provided is for educational purposes only and should not replace professional medical advice. Encourage users to consult with healthcare professionals for medical concerns.`;
  },
  enhanceResponse: (content: string) => {
    const disclaimer = `\n\n> Disclaimer: This information is for educational purposes only and is not a substitute for professional medical advice. Consult a qualified healthcare professional for diagnosis and treatment.`;
    return content.includes("Disclaimer:") ? content : content + disclaimer;
  },
};

/**
 * All enhancement rules
 */
export const ENHANCEMENT_RULES: EnhancementRule[] = [
  creatorEnhancement,
  technicalDocsEnhancement,
  currentEventsEnhancement,
  academicEnhancement,
  comparisonEnhancement,
  localInfoEnhancement,
  codingEnhancement,
  healthEnhancement,
];

/**
 * Apply all matching enhancement rules to a message
 */
export function applyEnhancements(
  message: string,
  options: {
    enhanceQuery?: boolean;
    enhanceSearchTerms?: boolean;
    injectSearchResults?: boolean;
    enhanceContext?: boolean;
    enhanceSystemPrompt?: boolean;
    enhanceResponse?: boolean;
  } = {},
) {
  // Debug flag to control logging verbosity (dev only)
  const DEBUG_ENHANCEMENTS = process.env.NODE_ENV === "development";

  // Sort rules by priority
  const sortedRules = [...ENHANCEMENT_RULES]
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.priority - b.priority);

  const matchingRules = sortedRules.filter((rule) => rule.matcher(message));

  const result = {
    matchedRules: matchingRules.map((r) => ({ id: r.id, name: r.name })),
    enhancedQuery: message,
    enhancedSearchTerms: [] as string[],
    injectedResults: [] as SearchResult[],
    enhancedContext: "",
    enhancedSystemPrompt: "",
    prioritizedUrls: [] as string[],
    responseTransformers: [] as Array<(s: string) => string>,
  };

  // Apply each matching rule
  for (const rule of matchingRules) {
    if (options.enhanceQuery && rule.enhanceQuery) {
      const beforeEnhancement = result.enhancedQuery;
      result.enhancedQuery = rule.enhanceQuery(result.enhancedQuery);

      // Log when query enhancement occurs for debugging (dev only)
      if (DEBUG_ENHANCEMENTS && beforeEnhancement !== result.enhancedQuery) {
        console.info("🔧 Query enhanced by rule:", {
          ruleId: rule.id,
          ruleName: rule.name,
          before: beforeEnhancement,
          after: result.enhancedQuery,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (options.enhanceSearchTerms && rule.enhanceSearchTerms) {
      const terms = rule.enhanceSearchTerms(result.enhancedSearchTerms);
      result.enhancedSearchTerms.push(...terms);
    }

    if (options.injectSearchResults && rule.injectSearchResults) {
      result.injectedResults.push(...rule.injectSearchResults());
    }

    if (options.enhanceContext && rule.enhanceContext) {
      result.enhancedContext = rule.enhanceContext(result.enhancedContext);
    }

    if (options.enhanceSystemPrompt && rule.enhanceSystemPrompt) {
      result.enhancedSystemPrompt = rule.enhanceSystemPrompt(
        result.enhancedSystemPrompt,
      );
    }

    if (rule.prioritizeUrls) {
      result.prioritizedUrls.push(...rule.prioritizeUrls);
    }

    if (options.enhanceResponse && rule.enhanceResponse) {
      result.responseTransformers.push(rule.enhanceResponse);
    }
  }

  // Deduplicate arrays
  result.enhancedSearchTerms = [...new Set(result.enhancedSearchTerms)];
  result.prioritizedUrls = [...new Set(result.prioritizedUrls)];

  // Log enhancement summary for debugging (dev only)
  if (DEBUG_ENHANCEMENTS && matchingRules.length > 0) {
    console.info("🔧 Enhancement summary:", {
      messageLength: message.length,
      matchedRules: matchingRules.map((r) => ({ id: r.id, name: r.name })),
      queryChanged: result.enhancedQuery !== message,
      searchTermsAdded: result.enhancedSearchTerms.length,
      timestamp: new Date().toISOString(),
    });
  }

  return result;
}

/**
 * Check if a URL should be prioritized for scraping
 */
export function shouldPrioritizeUrl(
  url: string,
  prioritizedUrls: string[],
): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return prioritizedUrls.some((p) => {
      try {
        const pu = new URL(p.startsWith("http") ? p : `https://${p}`);
        const phost = pu.hostname.toLowerCase().replace(/^www\./, "");
        return host === phost || u.origin === pu.origin;
      } catch {
        // Fallback to suffix match for non-URL inputs (e.g., domains)
        return host.endsWith(p.toLowerCase().replace(/^www\./, ""));
      }
    });
  } catch {
    return false;
  }
}

/**
 * Sort search results with prioritized URLs first
 */
export function sortResultsWithPriority<
  T extends { url: string; relevanceScore?: number },
>(results: T[], prioritizedUrls: string[]): T[] {
  return [...results].sort((a, b) => {
    const aPriority = shouldPrioritizeUrl(a.url, prioritizedUrls);
    const bPriority = shouldPrioritizeUrl(b.url, prioritizedUrls);

    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;

    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });
}
