export function buildHumanShareUrl(privacy, ids, origin) {
  if (privacy === "public" && ids.publicId)
    return `${origin}/p/${ids.publicId}`;
  if ((privacy === "shared" || privacy === "llm") && ids.shareId)
    return `${origin}/s/${ids.shareId}`;
  if (ids.chatId) return `${origin}/chat/${ids.chatId}`;
  return null;
}

export function buildLlmTxtUrl(privacy, ids, origin) {
  if (privacy === "llm" || privacy === "shared") {
    if (ids.shareId)
      return `${origin}/api/chatTextMarkdown?shareId=${encodeURIComponent(ids.shareId)}`;
  }
  return null;
}
