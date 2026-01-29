import type { PrivacyOption } from "@/components/share/shareModalTypes";

type ShareModalContentProps = {
  selectedPrivacy: PrivacyOption;
  displayUrl: string;
  busy: boolean;
  urlCopied: boolean;
  markdownCopied: boolean;
  markdownContent: string;
  showMarkdown: boolean;
  closeBtnRef: React.RefObject<HTMLButtonElement>;
  onSelectPrivacy: (privacy: PrivacyOption) => void;
  onGenerateOrCopy: () => void;
  onCopyMarkdown: () => void;
  onClose: () => void;
  onDialogKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onOverlayKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onOverlayClick: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export function ShareModalContent({
  selectedPrivacy,
  displayUrl,
  busy,
  urlCopied,
  markdownCopied,
  markdownContent,
  showMarkdown,
  closeBtnRef,
  onSelectPrivacy,
  onGenerateOrCopy,
  onCopyMarkdown,
  onClose,
  onDialogKeyDown,
  onOverlayKeyDown,
  onOverlayClick,
}: ShareModalContentProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onKeyDown={onDialogKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onOverlayClick}
        onKeyDown={onOverlayKeyDown}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6 border border-gray-200 dark:border-gray-700 font-serif dark:font-mono">
        <button
          ref={closeBtnRef}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
              />
            </svg>
          </div>
          <h2
            id="share-modal-title"
            className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 dark:uppercase dark:tracking-wide"
          >
            Share this conversation
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {selectedPrivacy === "private" && "Only you can access this chat."}
            {selectedPrivacy === "shared" &&
              "Anyone with the link can view (not indexed)."}
            {selectedPrivacy === "public" &&
              "Publicly viewable and may appear in search results."}
            {selectedPrivacy === "llm" &&
              "LLM-friendly link; same visibility as Shared (not indexed)."}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Privacy Level
              </legend>
              <div className="mt-1 flex flex-col space-y-2">
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Private"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="private"
                    checked={selectedPrivacy === "private"}
                    onChange={() => onSelectPrivacy("private")}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Private
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Only you can see this chat.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Shared"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="shared"
                    checked={selectedPrivacy === "shared"}
                    onChange={() => onSelectPrivacy("shared")}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Shared
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Anyone with the link can view. Not indexed.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Public"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="public"
                    checked={selectedPrivacy === "public"}
                    onChange={() => onSelectPrivacy("public")}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Public
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Anyone can view and it may appear in search results.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="LLM Link"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="llm"
                    checked={selectedPrivacy === "llm"}
                    onChange={() => onSelectPrivacy("llm")}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      LLM Link (Markdown .txt)
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Same visibility as Shared, formatted for LLMs; not
                      indexed.
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>
          </div>

          {(selectedPrivacy === "shared" ||
            selectedPrivacy === "public" ||
            selectedPrivacy === "llm") && (
            <div className="space-y-3">
              <label
                htmlFor="share-url-input"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Link
              </label>
              <div className="flex gap-2">
                <input
                  id="share-url-input"
                  type="text"
                  value={displayUrl}
                  placeholder={
                    selectedPrivacy === "llm"
                      ? "Generate LLM-friendly .txt link"
                      : selectedPrivacy === "shared"
                        ? "Generate shared link"
                        : "Generate public link"
                  }
                  readOnly
                  className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={onGenerateOrCopy}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-60"
                  aria-label={
                    displayUrl
                      ? "Copy URL to clipboard"
                      : busy
                        ? "Generating…"
                        : "Generate URL"
                  }
                  disabled={busy}
                >
                  {displayUrl ? (
                    urlCopied ? (
                      "Copied!"
                    ) : (
                      "Copy"
                    )
                  ) : busy ? (
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="w-4 h-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          strokeWidth="4"
                          className="opacity-25"
                        />
                        <path
                          d="M4 12a8 8 0 018-8"
                          strokeWidth="4"
                          className="opacity-75"
                        />
                      </svg>
                      Generating…
                    </span>
                  ) : (
                    "Generate URL"
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {showMarkdown && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Export as Markdown
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={markdownContent}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={onCopyMarkdown}
                    className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-60"
                  >
                    {markdownCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
