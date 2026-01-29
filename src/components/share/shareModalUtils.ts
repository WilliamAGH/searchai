import type { PersistedPrivacy, PrivacyOption } from "@/components/share/shareModalTypes";
import { logger } from "@/lib/logger";

export const toPersistedPrivacy = (option: PrivacyOption): PersistedPrivacy =>
  option === "llm" ? "shared" : option;

/**
 * Build share URL based on privacy type and available IDs.
 */
export function buildShareUrl(
  privacy: PrivacyOption,
  ids: { shareId?: string; publicId?: string },
  exportBase?: string,
  llmTxtUrl?: string,
): string {
  if (privacy === "llm") {
    if (ids.shareId && exportBase) {
      return `${exportBase}?shareId=${encodeURIComponent(ids.shareId)}&format=txt`;
    }
    return llmTxtUrl ?? "";
  }

  if (privacy === "shared") {
    if (ids.shareId) {
      return `${window.location.origin}/s/${ids.shareId}`;
    }
    logger.error("Share failed: no shareId available");
    return "";
  }

  if (privacy === "public") {
    if (ids.publicId) {
      return `${window.location.origin}/p/${ids.publicId}`;
    }
    logger.error("Share failed: no publicId available");
    return "";
  }

  return "";
}
