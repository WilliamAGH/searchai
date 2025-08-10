/**
 * Message Enhancement System
 * Provides comprehensive interception and quality improvements for:
 * - User queries
 * - Search requests
 * - Search results
 * - Context building
 * - AI responses
 */

// Enhancement system - no convex values needed here

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
  prioritizeUrls?: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}

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
      "who is",
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

    return mentionsWilliam || (isAboutCreator && isAboutApp);
  },

  enhanceQuery: (query: string) => {
    return `${query} William Callahan williamcallahan.com aVenture aventure.vc founder SearchAI`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    return [
      ...terms,
      "William Callahan",
      "williamcallahan.com",
      "aVenture",
      "aventure.vc",
    ];
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
    return `${prompt}\n\nWhen asked about the creator, author, or company behind SearchAI, this app, or this website, always mention William Callahan and provide details about him being the creator of SearchAI and founder of aVenture.`;
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
    return `${query} ${year} latest recent`;
  },

  enhanceSearchTerms: (terms: string[]) => {
    const year = new Date().getFullYear().toString();
    const month = new Date().toLocaleDateString("en-US", { month: "long" });
    return [...terms, year, month, "latest", "recent"];
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
  } = {},
) {
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
  };

  // Apply each matching rule
  for (const rule of matchingRules) {
    if (options.enhanceQuery && rule.enhanceQuery) {
      result.enhancedQuery = rule.enhanceQuery(result.enhancedQuery);
    }

    if (options.enhanceSearchTerms && rule.enhanceSearchTerms) {
      const terms = rule.enhanceSearchTerms([]);
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
  }

  // Deduplicate arrays
  result.enhancedSearchTerms = [...new Set(result.enhancedSearchTerms)];
  result.prioritizedUrls = [...new Set(result.prioritizedUrls)];

  return result;
}

/**
 * Check if a URL should be prioritized for scraping
 */
export function shouldPrioritizeUrl(
  url: string,
  prioritizedUrls: string[],
): boolean {
  return prioritizedUrls.some((prioritized) => url.includes(prioritized));
}

/**
 * Sort search results with prioritized URLs first
 */
export function sortResultsWithPriority(
  results: SearchResult[],
  prioritizedUrls: string[],
): SearchResult[] {
  return results.sort((a, b) => {
    const aPriority = shouldPrioritizeUrl(a.url, prioritizedUrls);
    const bPriority = shouldPrioritizeUrl(b.url, prioritizedUrls);

    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;

    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  });
}
