/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import React, { Fragment, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Dialog, Transition } from "@headlessui/react";
import { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "../lib/types/chat";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  currentChatId: Id<"chats"> | string | null;
  onSelectChat: (chatId: Id<"chats"> | string | null) => void;
  onNewChat: () => void;
  onDeleteLocalChat?: (chatId: string) => void;
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  isCreatingChat?: boolean;
}

export function MobileSidebar({
  isOpen,
  onClose,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteLocalChat,
  onRequestDeleteChat,
  isCreatingChat = false,
}: MobileSidebarProps) {
  const deleteChat = useMutation(api.chats.deleteChat);
  // Ensure Headless UI Dialog has a stable initial focusable element on open
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleNewChat = React.useCallback(() => {
    console.info("🖱️ New Chat button clicked in MobileSidebar");
    onNewChat();
    onClose();
  }, [onNewChat, onClose]);

  const handleSelectChat = React.useCallback(
    (chatId: Id<"chats"> | string) => {
      onSelectChat(chatId);
      onClose();
    },
    [onSelectChat, onClose],
  );

  const handleDeleteChat = React.useCallback(
    async (chatId: Id<"chats"> | string, isCurrentChat: boolean) => {
      try {
        if (!window.confirm("Delete this chat? This cannot be undone.")) return;
        if (onRequestDeleteChat) {
          onRequestDeleteChat(chatId);
        } else {
          if (typeof chatId === "string") {
            onDeleteLocalChat?.(chatId);
          } else {
            await deleteChat({ chatId });
          }
        }
        if (isCurrentChat) {
          onSelectChat(null);
        }
      } catch (err) {
        if ((import.meta as unknown as { env?: { DEV?: boolean } })?.env?.DEV) {
          console.warn("Chat deletion failed:", err);
        }
      }
    },
    [onRequestDeleteChat, onDeleteLocalChat, deleteChat, onSelectChat],
  );

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50 lg:hidden"
        onClose={onClose}
        initialFocus={closeButtonRef}
      >
        <Transition.Child
          as={Fragment}
          enter="transition-opacity ease-linear duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity ease-linear duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/80" />
        </Transition.Child>

        <div className="fixed inset-0 flex">
          <Transition.Child
            as={Fragment}
            enter="transition ease-in-out duration-300 transform"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <Dialog.Panel
              tabIndex={-1}
              className="relative mr-16 flex w-full max-w-xs flex-1"
            >
              <Transition.Child
                as={Fragment}
                enter="ease-in-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in-out duration-300"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                  <button
                    type="button"
                    className="-m-2.5 p-2.5"
                    onClick={onClose}
                    ref={closeButtonRef}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <svg
                      className="h-6 w-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </Transition.Child>

              <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-gray-900 px-6 pb-2">
                <div className="flex h-16 shrink-0 items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-white"
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
                    </div>
                    <span className="text-lg font-semibold">SearchAI</span>
                  </div>
                </div>

                <nav className="flex flex-1 flex-col">
                  <button
                    onClick={handleNewChat}
                    disabled={isCreatingChat}
                    className="w-full px-4 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2 mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingChat ? (
                      <svg
                        className="w-5 h-5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    )}
                    {isCreatingChat ? "Creating..." : "New Chat"}
                  </button>

                  <div className="space-y-1">
                    <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Recent Chats
                    </h3>
                    {chats.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No chats yet
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {chats.map((chat) => (
                          <div
                            key={chat._id}
                            className="flex items-center gap-2 pr-2"
                          >
                            <button
                              onClick={() => handleSelectChat(chat._id)}
                              className={`flex-1 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                                currentChatId === chat._id
                                  ? "bg-gray-100 dark:bg-gray-800"
                                  : ""
                              }`}
                            >
                              <div className="font-medium truncate text-sm">
                                {chat.title}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-1">
                                {chat.isLocal && (
                                  <span className="bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-1 rounded">
                                    Local
                                  </span>
                                )}
                                {new Date(chat.updatedAt).toLocaleDateString()}
                              </div>
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteChat(
                                  chat._id,
                                  currentChatId === chat._id,
                                )
                              }
                              className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                              title="Delete chat"
                              aria-label="Delete chat"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </nav>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
