/**
 * Root application component
 * - Auth state management (sign-in/sign-up modals)
 * - Theme provider wrapper
 * - Responsive header with branding
 * - Sidebar toggle for mobile
 * - Conditional rendering for auth/unauth users
 */

import { Authenticated, Unauthenticated } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { SignInModal } from "@/components/SignInModal";
import { SignUpModal } from "@/components/SignUpModal";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/SignOutButton";
import { useClaimAnonymousChats } from "@/hooks/useClaimAnonymousChats";
import { ChatPage } from "@/components/ChatPage";
import { toastIcons } from "@/components/toastIcons";

export default function App() {
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasManuallyToggled, setHasManuallyToggled] = useState(false);

  // Keep the app pinned to the Visual Viewport on iOS Safari (address bar + keyboard).
  // This prevents the "gap under composer" where 100dvh can desync from the visible area.
  useEffect(() => {
    const setAppDvh = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-dvh", `${height}px`);
    };

    setAppDvh();

    // When the page itself can't scroll (we use internal scroll containers),
    // Safari's browser chrome can still expand/collapse during *element* scroll.
    // Capture scroll events and refresh dvh once per frame to avoid stale sizing.
    let rafId: number | null = null;
    const scheduleSetAppDvh = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setAppDvh();
      });
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", setAppDvh);
    vv?.addEventListener("scroll", setAppDvh);
    window.addEventListener("resize", setAppDvh);
    window.addEventListener("orientationchange", setAppDvh);
    window.addEventListener("scroll", scheduleSetAppDvh, true);

    return () => {
      vv?.removeEventListener("resize", setAppDvh);
      vv?.removeEventListener("scroll", setAppDvh);
      window.removeEventListener("resize", setAppDvh);
      window.removeEventListener("orientationchange", setAppDvh);
      window.removeEventListener("scroll", scheduleSetAppDvh, true);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Claim anonymous chats when user signs in
  useClaimAnonymousChats();

  // Handle responsive sidebar behavior
  useEffect(() => {
    const syncSidebarToLayout = (isDesktop: boolean) => {
      setIsSidebarOpen((current) => {
        if (!isDesktop && current) {
          return false;
        }
        return current;
      });
    };

    let lastIsDesktop = window.innerWidth >= 1024;

    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;

      if (hasManuallyToggled) {
        if (isDesktop !== lastIsDesktop) {
          setHasManuallyToggled(false);
          syncSidebarToLayout(isDesktop);
        }
      } else {
        syncSidebarToLayout(isDesktop);
      }

      lastIsDesktop = isDesktop;
    };

    if (!hasManuallyToggled) {
      handleResize();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [hasManuallyToggled]);

  const openSignUp = useCallback(() => {
    setShowSignInModal(false);
    setShowSignUpModal(true);
  }, []);

  const openSignIn = useCallback(() => {
    setShowSignUpModal(false);
    setShowSignInModal(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      return !prev;
    });
    setHasManuallyToggled(true);
  }, []);

  const closeSignIn = useCallback(() => {
    setShowSignInModal(false);
  }, []);

  const closeSignUp = useCallback(() => {
    setShowSignUpModal(false);
  }, []);

  // Navigating home via <Link /> avoids full-page reloads in the SPA

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="h-full overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
          <div className="h-full flex flex-col">
            <header className="flex-shrink-0 sticky top-0 z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/30">
              <div className="h-[3.75rem] sm:h-16 flex items-center justify-between pl-3 sm:pl-4 pr-4 sm:pr-6 lg:pr-8">
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                  {/* Mobile menu button */}
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Toggle sidebar"
                  >
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>Menu</title>
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
                      <title>Search</title>
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
                </div>
                <div className="flex items-center gap-2.5 sm:gap-4">
                  <Authenticated>
                    <SignOutButton />
                  </Authenticated>
                  <Unauthenticated>
                    <button
                      type="button"
                      onClick={openSignUp}
                      className="inline-flex h-9 items-center justify-center px-3 sm:px-4 text-sm sm:text-base font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors rounded-md whitespace-nowrap dark:font-mono"
                    >
                      <span className="hidden sm:inline">Sign Up Free</span>
                      <span className="sm:hidden">Sign Up</span>
                    </button>
                    <button
                      type="button"
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

            <main className="flex-1 flex min-h-0 overflow-hidden">
              <Routes>
                {[
                  "/",
                  "/chat",
                  "/chat/:chatId",
                  "/s/:shareId",
                  "/p/:publicId",
                ].map((path) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <ChatPage
                        isSidebarOpen={isSidebarOpen}
                        onToggleSidebar={toggleSidebar}
                      />
                    }
                  />
                ))}
              </Routes>
            </main>

            <Toaster
              position="top-center"
              // Provide explicit icons to avoid Sonner referencing its internal
              // icon components before initialization in some bundlers.
              icons={toastIcons}
            />

            <SignInModal
              isOpen={showSignInModal}
              onClose={closeSignIn}
              onSwitchToSignUp={openSignUp}
            />
            <SignUpModal
              isOpen={showSignUpModal}
              onClose={closeSignUp}
              onSwitchToSignIn={openSignIn}
            />
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
