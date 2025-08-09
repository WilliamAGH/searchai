import React, { useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShare: (isPublic: boolean) => void;
  shareUrl: string;
  isShared: boolean;
  isPublic: boolean;
}

export function ShareModal({ isOpen, onClose, onShare, shareUrl, isShared, isPublic }: ShareModalProps) {
  const [allowIndexing, setAllowIndexing] = useState(isPublic);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleShare = () => {
    onShare(allowIndexing);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const getShareStatus = () => {
    if (isPublic) return 'public';
    if (isShared) return 'shared';
    return 'private';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6 border border-gray-200 dark:border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="text-center mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">
            Share this conversation
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Make this chat accessible to anyone with the link
          </p>
        </div>

        {isShared ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  Chat is {getShareStatus()}
                </span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {isPublic 
                  ? "This chat can be found in search results and accessed by anyone with the link."
                  : "This chat can be accessed by anyone with the link but won't appear in search results."
                }
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Share URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowIndexing}
                  onChange={(e) => setAllowIndexing(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 rounded focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Allow this chat to appear in Google search results
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    When enabled, search engines can index and display this conversation
                  </div>
                </div>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleShare}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg transition-colors font-medium"
              >
                Share Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
