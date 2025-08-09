/**
 * Authentication modal component
 * - Overlay with backdrop blur
 * - Contains SignInForm
 * - Mobile responsive
 * - Close on backdrop click
 */

import React from 'react';
import { SignInForm } from '../SignInForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Auth modal for sign-in/sign-up
 * @param isOpen - Modal visibility state
 * @param onClose - Close callback
 * @returns Modal portal or null
 */
export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="text-center mb-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Continue with SearchAI
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Create a free account to continue your conversation and save your chat history.
          </p>
        </div>
        
        <SignInForm />
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Free forever • No credit card required
          </p>
        </div>
      </div>
    </div>
  );
}
