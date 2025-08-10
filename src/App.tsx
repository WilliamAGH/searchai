/**
 * Root application component
 * - Auth state management (sign-in/sign-up modals)
 * - Theme provider wrapper
 * - Responsive header with branding
 * - Sidebar toggle for mobile
 * - Conditional rendering for auth/unauth users
 */

import { Authenticated, Unauthenticated } from "convex/react";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { ChatInterface } from "./components/ChatInterface";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";
import { useState } from "react";
import { SignInModal } from "./components/SignInModal";
import { SignUpModal } from "./components/SignUpModal";

/**
 * Main App component
 * - Manages auth modal states
 * - Controls sidebar visibility
 * - Handles navigation to home
 */
const ChatPage = () => {
  const { chatId, shareId, publicId } = useParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  return (
    <>
      <Authenticated>
        <ChatInterface
          isAuthenticated={true}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={toggleSidebar}
          chatId={chatId}
          shareId={shareId}
          publicId={publicId}
          onRequestSignUp={() => { setShowSignInModal(false); setShowSignUpModal(true); }}
          onRequestSignIn={() => { setShowSignUpModal(false); setShowSignInModal(true); }}
        />
      </Authenticated>
      <Unauthenticated>
        <ChatInterface
          isAuthenticated={false}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={toggleSidebar}
          chatId={chatId}
          shareId={shareId}
          publicId={publicId}
          onRequestSignUp={() => { setShowSignInModal(false); setShowSignUpModal(true); }}
          onRequestSignIn={() => { setShowSignUpModal(false); setShowSignInModal(true); }}
        />
      </Unauthenticated>
    </>
  );
};

export default function App() {
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  
  const handleHomeClick = () => {
    window.location.href = '/';
  };

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="h-dvh overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
          <div className="h-dvh flex flex-col">
            <header className="flex-shrink-0 sticky top-0 z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/30">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={handleHomeClick}
                    aria-label="Go home"
                    className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-colors"
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  <h1 className="text-base sm:text-lg font-medium bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent hover:from-emerald-600 hover:to-teal-600 dark:hover:from-emerald-400 dark:hover:to-teal-400 transition-all">
                    SearchAI
                  </h1>
                  <span className="hidden sm:inline-block text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full font-medium hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors">
                    search-ai.io
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Authenticated>
                    <SignOutButton />
                  </Authenticated>
                  <Unauthenticated>
                    <button onClick={() => { setShowSignInModal(false); setShowSignUpModal(true); }} className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors rounded-md whitespace-nowrap dark:font-mono">
                      <span className="hidden sm:inline">Sign Up Free</span>
                      <span className="sm:hidden">Sign Up</span>
                    </button>
                    <button onClick={() => { setShowSignUpModal(false); setShowSignInModal(true); }} className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 whitespace-nowrap dark:font-mono">
                      Sign In
                    </button>
                  </Unauthenticated>
                  <ThemeToggle />
                </div>
              </div>
            </header>
            
            <main className="flex-1 flex overflow-hidden">
              <Routes>
                <Route path="/" element={<ChatPage />} />
                <Route path="/chat/:chatId" element={<ChatPage />} />
                <Route path="/s/:shareId" element={<ChatPage />} />
                <Route path="/p/:publicId" element={<ChatPage />} />
              </Routes>
            </main>
            
            <Toaster position="top-center" />
            
            <SignInModal isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} onSwitchToSignUp={() => { setShowSignInModal(false); setShowSignUpModal(true); }} />
            <SignUpModal isOpen={showSignUpModal} onClose={() => setShowSignUpModal(false)} onSwitchToSignIn={() => { setShowSignUpModal(false); setShowSignInModal(true); }} />
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
