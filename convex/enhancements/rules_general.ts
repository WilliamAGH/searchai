import type { EnhancementRule } from "./types";

/**
 * Current Events Enhancement
 */
export const currentEventsEnhancement: EnhancementRule = {
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
 * Product Comparison Enhancement
 */
export const comparisonEnhancement: EnhancementRule = {
  id: "comparison",
  name: "Product & Service Comparison",
  description: "Enhances comparison queries with review sites and versus searches",
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
export const localInfoEnhancement: EnhancementRule = {
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
 * Health & Medical Enhancement (with disclaimer)
 */
export const healthEnhancement: EnhancementRule = {
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
