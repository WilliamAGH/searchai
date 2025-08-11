export type Privacy = "private" | "shared" | "public" | "llm";

export interface ShareIds {
  chatId?: string;
  shareId?: string;
  publicId?: string;
}

export function buildHumanShareUrl(
  privacy: Privacy,
  ids: ShareIds,
  origin: string,
): string | null {
  if (privacy === "public" && ids.publicId)
    return `${origin}/p/${ids.publicId}`;
  if ((privacy === "shared" || privacy === "llm") && ids.shareId)
    return `${origin}/s/${ids.shareId}`;
  if (ids.chatId) return `${origin}/chat/${ids.chatId}`;
  return null;
}

export function buildLlmTxtUrl(
  privacy: Privacy,
  ids: ShareIds,
  origin: string,
): string | null {
  if (privacy === "llm" || privacy === "shared") {
    if (ids.shareId)
      return `${origin}/api/chatTextMarkdown?shareId=${encodeURIComponent(ids.shareId)}`;
  }
  return null;
}
