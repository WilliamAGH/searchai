/**
 * Centralized SEO and Open Graph metadata constants.
 * Single source of truth consumed by useMetaTags (client) and
 * conceptually mirrored in the index.html template (server).
 */

export const SEO = {
  siteName: "SearchAI",
  siteUrl: "https://search-ai.io",
  defaultTitle: "SearchAI - AI-Powered Web Search",
  defaultDescription:
    "Search the web with AI. Get accurate, up-to-date information with sources powered by real-time web search.",
  ogImagePath: "/images/opengraph/searchai-og-card.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: "summary_large_image" as const,
  twitterSite: "@williamcallahan",
  twitterCreator: "@williamcallahan",
  locale: "en_US",
  sharedDescription: "Shared Research Chat on SearchAI",
  publicDescription: "AI-Powered Research Chat on SearchAI",
  selectors: {
    ogTitle: 'meta[property="og:title"]',
    ogDescription: 'meta[property="og:description"]',
    twitterTitle: 'meta[name="twitter:title"]',
    twitterDescription: 'meta[name="twitter:description"]',
  },
} as const;
