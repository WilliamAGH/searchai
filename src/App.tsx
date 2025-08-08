import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { ChatInterface } from "./components/ChatInterface";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";
import { useState } from "react";
import { AuthModal } from "./components/AuthModal";

export default function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleHomeClick = () => {
    // Navigate to home (new chat)
    window.location.href = '/';
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/30">
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer" onClick={handleHomeClick}>
                <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-colors">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h1 className="text-lg font-medium bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent hover:from-emerald-600 hover:to-teal-600 dark:hover:from-emerald-400 dark:hover:to-teal-400 transition-all">
                  SearchAI
                </h1>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full font-medium hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors">
                  search-ai.io
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Authenticated>
                  <SignOutButton />
                </Authenticated>
                <Unauthenticated>
                  <button 
                    onClick={() => setShowAuthModal(true)}
                    className="px-4 py-1.5 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors rounded-md"
                  >
                    Sign Up Free
                  </button>
                  <button 
                    onClick={() => setShowAuthModal(true)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Sign In
                  </button>
                </Unauthenticated>
                <ThemeToggle />
              </div>
            </div>
          </header>
          
          <main className="flex-1 flex">
            <Authenticated>
              <ChatInterface isAuthenticated={true} />
            </Authenticated>
            <Unauthenticated>
              <ChatInterface isAuthenticated={false} />
            </Unauthenticated>
          </main>
          
          <Toaster position="top-center" />
          
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}
