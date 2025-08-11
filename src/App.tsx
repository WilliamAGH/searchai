/**
 * Root application component
 * - Auth state management (sign-in/sign-up modals)
 * - Theme provider wrapper
 * - Responsive header with branding
 * - Sidebar toggle for mobile
 * - Conditional rendering for auth/unauth users
 */

import React, { useState, useEffect, useCallback } from "react";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import {
  BrowserRouter,
  Routes,
  Route,
  useParams,
  useLocation,
  Link,
} from "react-router-dom";
import { ChatInterface } from "./components/ChatInterface";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";
import { SignInModal } from "./components/SignInModal";
import { SignUpModal } from "./components/SignUpModal";

/**
 * Main App component
 * - Manages auth modal states
 * - Controls sidebar visibility
 * - Handles navigation to home
 */
interface ChatPageProps {
  onRequestSignUp: () => void;
  onRequestSignIn: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

function ChatPage({
  onRequestSignUp,
  onRequestSignIn,
  isSidebarOpen,
  onToggleSidebar,
}: ChatPageProps) {
  const { chatId, shareId, publicId } = useParams();
  const location = useLocation();
  const chatKey = chatId ?? shareId ?? publicId ?? "root";

  // Set per-route canonical and url metas
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;
    const canonicalHref =
      window.location.origin + location.pathname + (location.search || "");
    let link = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.href = canonicalHref;

    // Best-effort update for sharing metas
    const og = document.querySelector(
      'meta[property="og:url"]',
    ) as HTMLMetaElement | null;
    if (og) og.setAttribute("content", canonicalHref);
    const tw = document.querySelector(
      'meta[name="twitter:url"]',
    ) as HTMLMetaElement | null;
    if (tw) tw.setAttribute("content", canonicalHref);
  }, [location.pathname, location.search]);

  return (
    <>
      <Authenticated>
        <ChatInterface
          key={chatKey}
          isAuthenticated={true}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          chatId={chatId}
          shareId={shareId}
          publicId={publicId}
          onRequestSignUp={onRequestSignUp}
          onRequestSignIn={onRequestSignIn}
        />
      </Authenticated>
      <Unauthenticated>
        <ChatInterface
          key={chatKey}
          isAuthenticated={false}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          chatId={chatId}
          shareId={shareId}
          publicId={publicId}
          onRequestSignUp={onRequestSignUp}
          onRequestSignIn={onRequestSignIn}
        />
      </Unauthenticated>
    </>
  );
}

export default function App() {
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const openSignUp = useCallback(() => {
    setShowSignInModal(false);
    setShowSignUpModal(true);
  }, []);

  const openSignIn = useCallback(() => {
    setShowSignUpModal(false);
    setShowSignInModal(true);
  }, []);

  // Navigating home via <Link /> avoids full-page reloads in the SPA

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="h-dvh overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
          <div className="h-dvh flex flex-col">
            <header className="flex-shrink-0 sticky top-0 z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/30">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[3.75rem] sm:h-16 flex items-center justify-between">
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                  {/* Mobile menu button */}
                  <button
                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                    className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
                    aria-label="Open chat menu"
                    title="Open chat menu"
                    type="button"
                  >
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </button>

                  <Link
                    to="/"
                    aria-label="Go home"
                    className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </Link>
                  <span className="text-lg font-semibold !normal-case tracking-normal text-gray-900 dark:text-white truncate max-w-[40vw]">
                    SearchAI
                  </span>
                  <span className="hidden sm:inline-block text-sm sm:text-base bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-2.5 py-0.5 rounded-full font-medium hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors">
                    search-ai.io
                  </span>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-4">
                  <Authenticated>
                    <SignOutButton />
                  </Authenticated>
                  <Unauthenticated>
                    <button
                      onClick={openSignUp}
                      className="inline-flex h-9 items-center justify-center px-3 sm:px-4 text-sm sm:text-base font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors rounded-md whitespace-nowrap dark:font-mono"
                    >
                      <span className="hidden sm:inline">Sign Up Free</span>
                      <span className="sm:hidden">Sign Up</span>
                    </button>
                    <button
                      onClick={openSignIn}
                      className="hidden sm:inline-flex h-9 items-center justify-center px-3 sm:px-4 text-sm sm:text-base font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 whitespace-nowrap dark:font-mono"
                    >
                      Sign In
                    </button>
                  </Unauthenticated>
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <main className="flex-1 flex overflow-hidden">
              <Routes>
                <Route
                  path="/"
                  element={
                    <ChatPage
                      onRequestSignUp={openSignUp}
                      onReuestSignIn={openSignIn}
                      isSidebarOpen={isSidebarOpen}
                      onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                    />
                  }
                />
                <Route
                  path="/chat/:chatId"
                  element={
                    <ChatPage
                      onRequestSignUp={openSignUp}
                      onRequestSignIn={openSignIn}
                      isSidebarOpen={isSidebarOpen}
                      onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                    />
                  }
                />
                <Route
                  path="/s/:shareId"
                  element={
                    <ChatPage
                      onRequestSignUp={openSignUp}
                      onRequestSignIn={openSignIn}
                      isSidebarOpen={isSidebarOpen}
                      onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                    />
                  }
                />
                <Route
                  path="/p/:publicId"
                  element={
                    <ChatPage
                      onRequestSignUp={openSignUp}
                      onRequestSignIn={openSignIn}
                      isSidebarOpen={isSidebarOpen}
                      onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                    />
                  }
                />
              </Routes>
            </main>

            <Toaster
              position="top-center"
              // Provide explicit icons to avoid Sonner referencing its internal
              // icon components before initialization in some bundlers.
              icons={{
                success: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    height={16}
                    width={16}
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                ),
                info: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    height={16}
                    width={16}
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                ),
                warning: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    height={16}
                    width={16}
                  >
                    <path
                      fillRule="evenodd"
                      d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                ),
                error: (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    height={16}
                    width={16}
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                ),
              }}
            />

            <SignInModal
              isOpen={showSignInModal}
              onClose={() => setShowSignInModal(false)}
              onSwitchToSignUp={() => {
                setShowSignInModal(false);
                setShowSignUpModal(true);
              }}
            />
            <SignUpModal
              isOpen={showSignUpModal}
              onClose={() => setShowSignUpModal(false)}
              onSwitchToSignIn={() => {
                setShowSignUpModal(false);
                setShowSignInModal(true);
              }}
            />
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
