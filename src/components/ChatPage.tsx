import { Authenticated, Unauthenticated } from "convex/react";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingBoundary } from "@/components/LoadingBoundary";
import ChatInterface from "@/components/ChatInterface";

interface ChatPageProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function ChatPage({ isSidebarOpen, onToggleSidebar }: ChatPageProps) {
  const { chatId, shareId, publicId } = useParams();
  const location = useLocation();
  const isLocalPreview =
    typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "localhost") &&
    !import.meta.env.DEV;

  // Set per-route canonical and url metas
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;
    // Strip trailing slash so the homepage canonical is "https://…" not "https://…/"
    const path = location.pathname.replace(/\/+$/, "");
    const canonicalHref =
      window.location.origin + path + (location.search || "");
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.href = canonicalHref;

    // Best-effort update for sharing metas
    const og = document.querySelector<HTMLMetaElement>(
      'meta[property="og:url"]',
    );
    if (og) og.setAttribute("content", canonicalHref);
    const tw = document.querySelector<HTMLMetaElement>(
      'meta[name="twitter:url"]',
    );
    if (tw) tw.setAttribute("content", canonicalHref);
  }, [location.pathname, location.search]);

  if (isLocalPreview) {
    return (
      <ErrorBoundary>
        <LoadingBoundary message="Loading chat interface...">
          <ChatInterface
            isAuthenticated={false}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={onToggleSidebar}
            chatId={chatId}
            shareId={shareId}
            publicId={publicId}
          />
        </LoadingBoundary>
      </ErrorBoundary>
    );
  }

  return (
    <>
      <Authenticated>
        <ErrorBoundary>
          <LoadingBoundary message="Loading chat interface...">
            <ChatInterface
              isAuthenticated={true}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={onToggleSidebar}
              chatId={chatId}
              shareId={shareId}
              publicId={publicId}
            />
          </LoadingBoundary>
        </ErrorBoundary>
      </Authenticated>
      <Unauthenticated>
        <ErrorBoundary>
          <LoadingBoundary message="Loading chat interface...">
            <ChatInterface
              isAuthenticated={false}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={onToggleSidebar}
              chatId={chatId}
              shareId={shareId}
              publicId={publicId}
            />
          </LoadingBoundary>
        </ErrorBoundary>
      </Unauthenticated>
    </>
  );
}
