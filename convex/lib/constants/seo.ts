/**
 * SEO metadata constants for Convex HTTP endpoints.
 * Canonical source for privacy-based descriptions and robots directives
 * used by ogMeta and publish_export_data routes.
 *
 * Frontend mirror: src/lib/constants/seo.ts (keep in sync).
 */

export const SHARED_DESCRIPTION = "Shared Research Chat on SearchAI";
export const PUBLIC_DESCRIPTION = "AI-Powered Research Chat on SearchAI";
export const DEFAULT_CHAT_TITLE = "Chat on SearchAI";

export const ROBOTS_INDEX = "index, follow";
export const ROBOTS_NOINDEX = "noindex, nofollow";

export function descriptionForPrivacy(privacy: string): string {
  if (privacy === "shared") return SHARED_DESCRIPTION;
  return PUBLIC_DESCRIPTION;
}

export function robotsForPrivacy(privacy: string): string {
  return privacy === "public" ? ROBOTS_INDEX : ROBOTS_NOINDEX;
}
