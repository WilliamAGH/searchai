import { useEffect } from "react";
import type { Chat } from "@/lib/types/chat";
import { SEO } from "@/lib/constants/seo";

interface MetaTagsProps {
  currentChatId: string | null;
  allChats: Chat[];
  shareId?: string;
  publicId?: string;
}

function setMetaContent(selector: string, content: string) {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) el.content = content;
}

function resolveDescription(
  shareId: string | undefined,
  publicId: string | undefined,
): string {
  if (shareId) return SEO.sharedDescription;
  if (publicId) return SEO.publicDescription;
  return SEO.defaultDescription;
}

/**
 * Hook to manage document title and OG/Twitter meta tags for chat routes.
 * Updates title, og:title, og:description, twitter:title, twitter:description
 * based on the current chat context and share/public state.
 */
export function useMetaTags({
  currentChatId,
  allChats,
  shareId,
  publicId,
}: MetaTagsProps) {
  useEffect(() => {
    const originalTitle = document.title;
    const resolvedChat = currentChatId
      ? allChats.find(
          (chat) => String(chat._id ?? "") === String(currentChatId),
        )
      : undefined;

    const chatTitle = resolvedChat?.title;
    const title = chatTitle
      ? `${chatTitle} · ${SEO.siteName}`
      : SEO.defaultTitle;
    const description = resolveDescription(shareId, publicId);

    document.title = title;
    setMetaContent(SEO.selectors.ogTitle, title);
    setMetaContent(SEO.selectors.ogDescription, description);
    setMetaContent(SEO.selectors.twitterTitle, title);
    setMetaContent(SEO.selectors.twitterDescription, description);

    return () => {
      document.title = originalTitle;
      setMetaContent(SEO.selectors.ogTitle, SEO.defaultTitle);
      setMetaContent(SEO.selectors.ogDescription, SEO.defaultDescription);
      setMetaContent(SEO.selectors.twitterTitle, SEO.defaultTitle);
      setMetaContent(SEO.selectors.twitterDescription, SEO.defaultDescription);
    };
  }, [currentChatId, allChats, shareId, publicId]);
}
