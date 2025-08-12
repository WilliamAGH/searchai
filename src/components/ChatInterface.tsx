/**
 * Main chat interface with authentication modals and message handling
 * - Orchestrates chats/messages for authenticated and anonymous users
 * - Handles sign-in/sign-up modal separation and switching
 * - Streams AI responses (Convex for auth, HTTP API for anonymous)
 * - Manages local storage for unauthenticated user data
 * - Implements topic change detection and new chat suggestions
 */

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSwipeable } from "react-swipeable";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDebounce, useThrottle } from "../hooks/useDebounce";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { formatConversationWithSources } from "../lib/clipboard";
import { logger } from "../lib/logger";
import type { Chat, LocalChat } from "../lib/types/chat";
import { createLocalChat } from "../lib/types/chat";
import type { LocalMessage, Message } from "../lib/types/message";
import { createLocalMessage } from "../lib/types/message";
import { looksChatId } from "../lib/utils";
import { validateStreamChunk } from "../lib/validation/apiResponses";
import {
  parseLocalChats,
  parseLocalMessages,
} from "../lib/validation/localStorage";
import { ChatSidebar } from "./ChatSidebar";
import { CopyButton } from "./CopyButton";
import { FollowUpPrompt } from "./FollowUpPrompt";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { MobileSidebar } from "./MobileSidebar";
import { ShareModal } from "./ShareModal";

// Canonical chat path (privacy-aware)
const chatPath = (c?: Chat, id?: Id<"chats"> | string | null): string =>
  c
    ? c.privacy === "public" && c.publicId
      ? `/p/${c.publicId}`
      : c.privacy === "shared" && c.shareId
        ? `/s/${c.shareId}`
        : `/chat/${c._id}`
    : `/chat/${id ?? ""}`;

// Topic-change detection constants (made less sensitive)
const TOPIC_CHANGE_SIMILARITY_THRESHOLD = 0.1; // require much lower overlap
const TOPIC_CHANGE_MIN_WORD_LENGTH = 4; // ignore shorter words to reduce noise
const PROMPT_MIN_WORDS = 16; // require substantive input before prompting
const TOPIC_CHANGE_INDICATORS = [
  /^(completely different|unrelated|separate topic|new subject)/i,
  /^(switch to|change to|moving on to)/i,
  /^(now let's talk about something else|different conversation)/i,
];
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "if",
  "then",
  "else",
  "but",
  "about",
  "into",
  "over",
  "after",
  "before",
  "up",
  "down",
  "out",
  "off",
  "than",
  "so",
  "such",
  "via",
]);
// Planner and prompt cooldowns (ms)
const CHAT_COOLDOWN_MS = 45_000; // reduce planner frequency
const PROMPT_COOLDOWN_MS = 180_000; // show at most every 3m per chat
const DRAFT_MIN_LENGTH = 20; // avoid premature draft triggers

// Using unified types from lib/types/chat.ts and lib/types/message.ts
// These types leverage Convex's Doc<"chats"> and Doc<"messages"> for full type safety

export function ChatInterface({
  isAuthenticated,
  isSidebarOpen = false,
  onToggleSidebar,
  chatId: propChatId,
  shareId: propShareId,
  publicId: propPublicId,
  onRequestSignUp,
  onRequestSignIn: _onRequestSignIn,
}: {
  isAuthenticated: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatId?: string;
  shareId?: string;
  publicId?: string;
  onRequestSignUp?: () => void;
  onRequestSignIn?: () => void;
}) {
  logger.debug("💬 ChatInterface rendered", {
    isAuthenticated,
    propChatId,
    propShareId,
    propPublicId,
    isSidebarOpen,
  });
  useEffect(() => () => logger.debug("🧹 ChatInterface unmounted"), []);
  const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
  const apiBase = convexUrl
    .replace(".convex.cloud", ".convex.site")
    .replace(/\/+$/, "");
  const resolveApi = useCallback(
    (path: string) =>
      apiBase
        ? `${apiBase}/${path.startsWith("/") ? path.slice(1) : path}`
        : `/${path.startsWith("/") ? path.slice(1) : path}`,
    [apiBase],
  );

  type RetryInit = RequestInit & { retry?: number; retryDelayMs?: number };
  const fetchJsonWithRetry = useCallback(
    async (url: string, init: RetryInit = {}) => {
      const { retry = 2, retryDelayMs = 500, ...opts } = init;
      for (let i = 0; i <= retry; i++) {
        try {
          const res = await fetch(url, { ...opts, cache: "no-store" });
          if (!res.ok && res.status >= 500 && i < retry) {
            await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** i));
            continue;
          }
          return res;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          if (i < retry) {
            await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** i));
            continue;
          }
          throw e;
        }
      }
    },
    [],
  );

  const [currentChatId, setCurrentChatId] = useState<
    Id<"chats"> | string | null
  >(null);
  useEffect(
    () => logger.debug("🔄 currentChatId updated:", currentChatId),
    [currentChatId],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [localSidebarOpen, setLocalSidebarOpen] = useState(false);
  const sidebarOpen =
    isSidebarOpen !== undefined ? isSidebarOpen : localSidebarOpen;
  const handleToggleSidebar = useCallback(
    () =>
      onToggleSidebar
        ? onToggleSidebar()
        : setLocalSidebarOpen(!localSidebarOpen),
    [onToggleSidebar, localSidebarOpen],
  );
  const [messageCount, setMessageCount] = useState(0);
  // Auth modals are managed by the App; request via callbacks instead
  const [showShareModal, setShowShareModal] = useState(false);

  const storageNamespace = useMemo(
    () => `searchai:${window.location.host}`,
    [],
  );
  const chatsStorageKey = useMemo(
    () => `${storageNamespace}:chats`,
    [storageNamespace],
  );
  const messagesStorageKey = useMemo(
    () => `${storageNamespace}:messages`,
    [storageNamespace],
  );

  const [localChats, setLocalChats] = useLocalStorage<LocalChat[]>(
    chatsStorageKey,
    [],
    { debounceMs: 800 },
  );
  const [localMessages, setLocalMessages] = useLocalStorage<LocalMessage[]>(
    messagesStorageKey,
    [],
    { debounceMs: 800 },
  );

  const navigate = useNavigate();

  const navigateWithVerification = useCallback(
    async (path: string, options?: { replace?: boolean }): Promise<boolean> => {
      try {
        logger.debug("🧭 Nav:", path, options);
        navigate(path, options);
        // Give the router a bit more time to update the location before verifying
        await new Promise((r) => setTimeout(r, 100));
        const curr = window.location.pathname,
          target = path.split("?")[0];
        if (curr === target || curr.startsWith(target)) {
          logger.debug("✅");
          return true;
        }
        if (options?.replace) {
          navigate(path);
          await new Promise((r) => setTimeout(r, 100));
          if (
            window.location.pathname === target ||
            window.location.pathname.startsWith(target)
          )
            return true;
        }
        return false;
      } catch (e) {
        logger.error("❌", e);
        return false;
      }
    },
    [navigate],
  );

  const userSelectedChatAtRef = useRef<number | null>(null);
  const looksServerId = looksChatId;
  const deleteChat = useMutation(api.chats.deleteChat);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const createChat = useMutation(api.chats.createChat);
  const updateChatPrivacy = useMutation(api.chats.updateChatPrivacy);
  const importLocalChats = useMutation(api.chats.importLocalChats);
  const generateResponse = useAction(api.ai.generateStreamingResponse);
  const planSearch = useAction(api.search.planSearch);
  const recordClientMetric = useAction(api.search.recordClientMetric);
  const summarizeRecentAction = useAction(api.chats.summarizeRecentAction);

  const getUserChatsArgs = isAuthenticated ? undefined : "skip";
  const chats = useQuery(
    api.chats.getUserChats,
    getUserChatsArgs as undefined | "skip",
  );
  const opaqueParam = looksServerId(propChatId);
  const getByOpaqueArgs =
    isAuthenticated && opaqueParam
      ? { chatId: propChatId as Id<"chats"> }
      : ("skip" as const);
  const chatByOpaqueId = useQuery(
    api.chats.getChatByOpaqueId,
    getByOpaqueArgs as { chatId: Id<"chats"> } | "skip",
  );
  const getByShareArgs = propShareId
    ? { shareId: propShareId }
    : ("skip" as const);
  const chatByShareId = useQuery(
    api.chats.getChatByShareId,
    getByShareArgs as { shareId: string } | "skip",
  );
  const getByPublicArgs = propPublicId
    ? { publicId: propPublicId }
    : ("skip" as const);
  const chatByPublicId = useQuery(
    api.chats.getChatByPublicId,
    getByPublicArgs as { publicId: string } | "skip",
  );
  const looksServerForCurrent = looksServerId(String(currentChatId || ""));
  const getMessagesArgs =
    currentChatId && looksServerForCurrent
      ? { chatId: currentChatId as Id<"chats"> }
      : ("skip" as const);
  const messages = useQuery(
    api.chats.getChatMessages,
    getMessagesArgs as { chatId: Id<"chats"> } | "skip",
  );

  useEffect(
    () =>
      logger.debug(
        "🧾 messages updated",
        Array.isArray(messages)
          ? { count: messages.length }
          : { value: messages },
      ),
    [messages],
  );

  // Callbacks for sidebar operations
  const handleMobileSidebarClose = useCallback(() => {
    logger.debug("📱 Dialog onClose", { sidebarOpen });
    if (sidebarOpen) handleToggleSidebar();
  }, [sidebarOpen, handleToggleSidebar]);

  // (moved) handleSelectChat defined after allChats to avoid TDZ

  // Callbacks for deleting local chats
  const handleDeleteLocalChat = useCallback(
    (chatId: string) => {
      setLocalChats((prev) => prev.filter((c) => c._id !== chatId));
      setLocalMessages((prev) => prev.filter((m) => m.chatId !== chatId));
    },
    [setLocalChats, setLocalMessages],
  );

  // Callbacks for requesting chat deletion
  const handleRequestDeleteChat = useCallback(
    (chatId: Id<"chats"> | string) => {
      if (!looksServerId(String(chatId))) {
        setLocalChats((prev) => prev.filter((c) => c._id !== chatId));
        setLocalMessages((prev) => prev.filter((m) => m.chatId !== chatId));
      } else {
        setTimeout(async () => {
          try {
            await deleteChat({ chatId: chatId as Id<"chats"> });
          } catch {}
        }, 5000);
      }
      setUndoBanner({
        type: "chat",
        chatId,
        expiresAt: Date.now() + 5000,
      });
    },
    [setLocalChats, setLocalMessages, deleteChat, looksServerId],
  );

  // Callbacks for deleting messages
  const handleDeleteLocalMessage = useCallback(
    (messageId: string) => {
      setLocalMessages((prev) => prev.filter((m) => m._id !== messageId));
    },
    [setLocalMessages],
  );

  const handleRequestDeleteMessage = useCallback(
    (messageId: string) => {
      if (messageId.startsWith("local_") || messageId.startsWith("msg_")) {
        setLocalMessages((prev) => prev.filter((m) => m._id !== messageId));
      } else {
        setTimeout(async () => {
          try {
            await deleteMessage({ messageId: messageId as Id<"messages"> });
          } catch {}
        }, 5000);
      }
      setUndoBanner({
        type: "message",
        messageId,
        expiresAt: Date.now() + 5000,
      });
    },
    [setLocalMessages, deleteMessage],
  );

  const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string>("");
  const [plannerHint, setPlannerHint] = useState<
    { reason?: string; confidence?: number } | undefined
  >(undefined);
  // Undo deletion state (chat/message)
  const [undoBanner, setUndoBanner] = useState<null | {
    type: "chat" | "message";
    chatId?: Id<"chats"> | string;
    messageId?: string;
    expiresAt: number;
  }>(null);
  const _UNDO_TIMEOUT_MS = 5000;
  const [lastPlannerCallAtByChat, setLastPlannerCallAtByChat] = useState<
    Record<string, number>
  >({});
  const [lastPromptAtByChat, setLastPromptAtByChat] = useState<
    Record<string, number>
  >({});
  const [lastDraftSeen, setLastDraftSeen] = useState<string>("");
  const [searchProgress, setSearchProgress] = useState<{
    stage: "searching" | "scraping" | "analyzing" | "generating";
    message: string;
    urls?: string[];
    currentUrl?: string;
  } | null>(null);

  // Fallback: migrate legacy keys to namespaced keys (one-time, per origin)
  useEffect(() => {
    try {
      const legacyChats = window.localStorage.getItem("searchai_chats");
      const legacyMsgs = window.localStorage.getItem("searchai_messages");
      const hasNew =
        (localChats?.length ?? 0) > 0 || (localMessages?.length ?? 0) > 0;
      if (!hasNew && (legacyChats || legacyMsgs)) {
        if (legacyChats) {
          const parsed = parseLocalChats(legacyChats);
          if (parsed.length > 0) setLocalChats(parsed);
        }
        if (legacyMsgs) {
          const parsed = parseLocalMessages(legacyMsgs);
          if (parsed.length > 0) setLocalMessages(parsed);
        }
        // Clear legacy keys after copying
        try {
          window.localStorage.removeItem("searchai_chats");
          window.localStorage.removeItem("searchai_messages");
        } catch {}
      }
    } catch {}
  }, [
    localChats?.length,
    localMessages?.length,
    setLocalChats,
    setLocalMessages,
  ]);

  // Migration guards and related state moved here for clarity

  // One-per-mount migration guards
  const migrationAttemptedRef = useRef(false);
  const migratingRef = useRef(false);
  const MIGRATION_RETRY_KEY = useMemo(
    () => `${storageNamespace}:migration_retry_at`,
    [storageNamespace],
  );
  const MIGRATION_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

  // ID generation is now handled by createLocalChat() helper function

  const isTopicChange = useCallback(
    (newMessage: string, previousMessages: LocalMessage[]) => {
      if (previousMessages.length < 2) return false;
      const lastUserMessage = [...previousMessages]
        .reverse()
        .find((m) => m.role === "user");
      if (!lastUserMessage) return false;
      const newWords = new Set(
        newMessage
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > TOPIC_CHANGE_MIN_WORD_LENGTH),
      );
      const lastWords = new Set(
        (lastUserMessage.content || "")
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > TOPIC_CHANGE_MIN_WORD_LENGTH),
      );
      const intersection = new Set(
        [...newWords].filter((x) => lastWords.has(x)),
      );
      const similarity =
        intersection.size / Math.max(newWords.size, lastWords.size);
      return (
        similarity < TOPIC_CHANGE_SIMILARITY_THRESHOLD &&
        TOPIC_CHANGE_INDICATORS.some((pattern) => pattern.test(newMessage))
      );
    },
    [],
  );

  // Optimistic chat state for immediate UI updates
  const [optimisticChat, setOptimisticChat] = useState<Chat | null>(null);

  // Get all chats (either from Convex or local storage)
  const allChats = useMemo(() => {
    let baseChats: Chat[] = [];

    if (isAuthenticated && chats) {
      baseChats = chats;
    } else if (!isAuthenticated) {
      baseChats = localChats;
    }

    // Add optimistic chat if it exists and isn't already in the list
    if (
      optimisticChat &&
      !baseChats.find((c) => c._id === optimisticChat._id)
    ) {
      return [optimisticChat, ...baseChats];
    }

    return baseChats;
  }, [isAuthenticated, chats, localChats, optimisticChat]);

  // Unified chat selection + navigation (placed after allChats to avoid TDZ)
  const handleSelectChat = useCallback(
    (id: Id<"chats"> | string) => {
      userSelectedChatAtRef.current = Date.now();
      setCurrentChatId(id);
      try {
        const sel = allChats.find((c) => String(c._id) === String(id));
        const path = chatPath(sel, id);
        if (path !== window.location.pathname)
          void navigateWithVerification(path);
      } catch {}
    },
    [allChats, navigateWithVerification],
  );

  // Get current messages (either from Convex or local storage)
  const currentMessages = useMemo(() => {
    if (isAuthenticated && messages) {
      return messages;
    } else if (!isAuthenticated && typeof currentChatId === "string") {
      const filtered = localMessages.filter(
        (msg) => msg.chatId === currentChatId,
      );
      logger.debug("📨 Filtered local messages for current chat:", {
        currentChatId,
        totalLocalMessages: localMessages.length,
        filteredMessages: filtered.length,
      });
      return filtered;
    }
    return [];
  }, [isAuthenticated, messages, localMessages, currentChatId]);

  // Build user message history for terminal-like navigation (oldest -> newest)
  const userHistory = useMemo(() => {
    const list = currentMessages
      .filter((m: Message | LocalMessage) => m.role === "user")
      .map((m: Message | LocalMessage) => m.content)
      .filter(
        (s: string | undefined): s is string =>
          typeof s === "string" && s.trim().length > 0,
      );
    // De-duplicate consecutive duplicates
    const deduped: string[] = [];
    for (const s of list) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== s)
        deduped.push(s);
    }
    return deduped;
  }, [currentMessages]);

  // URL → state: derive selection from URL/queries/local
  useEffect(() => {
    // Don't override currentChatId if user just initiated a chat selection/navigation
    // But allow authentication-related updates to proceed normally
    const recentChatAction =
      userSelectedChatAtRef.current &&
      Date.now() - userSelectedChatAtRef.current < 1000;

    // Only skip URL override for chat navigation, not authentication changes
    if (recentChatAction && currentChatId) {
      logger.debug("🚫 Skipping URL override due to recent chat action");
      return;
    }

    // Only process when we have actual data changes, not on every render
    let newChatId: string | null = null;

    // Priority order: server queries first, then URL params, then local
    if (isAuthenticated) {
      if (chatByOpaqueId && chatByOpaqueId._id !== currentChatId) {
        newChatId = chatByOpaqueId._id;
        logger.debug("🔗 url→state matched chatByOpaqueId", newChatId);
      } else if (chatByShareId && chatByShareId._id !== currentChatId) {
        newChatId = chatByShareId._id;
        logger.debug("🔗 url→state matched chatByShareId", newChatId);
      } else if (chatByPublicId && chatByPublicId._id !== currentChatId) {
        newChatId = chatByPublicId._id;
        logger.debug("🔗 url→state matched chatByPublicId", newChatId);
      } else if (
        propChatId &&
        looksServerId(propChatId) &&
        propChatId !== currentChatId
      ) {
        newChatId = propChatId;
        logger.debug("🔗 url→state matched propChatId (server)", newChatId);
      }
    } else {
      // For unauthenticated users, check URL params against local chats
      if (propChatId) {
        const localChat = localChats.find((chat) => chat._id === propChatId);
        if (localChat && localChat._id !== currentChatId) {
          newChatId = localChat._id;
          logger.debug(
            "🔗 url→state matched local propChatId (unauth)",
            newChatId,
          );
        }
      } else if (propShareId) {
        const localChat = localChats.find(
          (chat) => chat.shareId === propShareId,
        );
        if (localChat && localChat._id !== currentChatId) {
          newChatId = localChat._id;
          logger.debug(
            "🔗 url→state matched local shareId (unauth)",
            newChatId,
          );
        }
      } else if (propPublicId) {
        const localChat = localChats.find(
          (chat) => chat.publicId === propPublicId,
        );
        if (localChat && localChat._id !== currentChatId) {
          newChatId = localChat._id;
          logger.debug(
            "🔗 url→state matched local publicId (unauth)",
            newChatId,
          );
        }
      }
    }

    if (newChatId && newChatId !== currentChatId) {
      logger.debug("🔄 Setting currentChatId from URL/data:", newChatId);
      setCurrentChatId(newChatId);
    }
  }, [
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
    isAuthenticated,
    propChatId,
    looksServerId,
    propShareId,
    propPublicId,
    localChats,
    currentChatId,
  ]);

  const hasSetInitialUrlRef = useRef(false);
  // State → URL: navigate to canonical path for current chat
  useEffect(() => {
    if (!currentChatId) {
      logger.debug("🧭 state→url: currentChatId is null; skip");
      return;
    }
    const chat = allChats.find((c) => String(c._id) === String(currentChatId));

    if (chat) {
      const path = chatPath(chat, currentChatId);
      if (path !== window.location.pathname) {
        const first = !hasSetInitialUrlRef.current;
        logger.debug("🧭 state→url: navigating", { path, first });
        if (first) {
          void navigateWithVerification(path, { replace: true });
          hasSetInitialUrlRef.current = true;
        } else {
          void navigateWithVerification(path);
        }
      }
    } else {
      // Fallback for a newly created chat that is not yet in `allChats`
      const path = `/chat/${currentChatId}`;
      if (path !== window.location.pathname) {
        logger.debug("🧭 state→url: fallback navigating", { path });
        void navigateWithVerification(path);
      }
    }
  }, [currentChatId, allChats, navigateWithVerification]);

  useEffect(() => {
    const chat = allChats.find((c) => c._id === currentChatId);
    const metaRobots = document.querySelector('meta[name="robots"]');
    if (chat && metaRobots) {
      if (chat.privacy === "public") {
        metaRobots.setAttribute("content", "index, follow");
      } else {
        metaRobots.setAttribute("content", "noindex, nofollow");
      }
    }
  }, [currentChatId, allChats]);

  // Get current chat
  const currentChat = useMemo(() => {
    if (!currentChatId) return undefined;
    const idStr = String(currentChatId);
    const foundChat = allChats.find((c) => String(c._id) === idStr);
    logger.debug(
      "🗨️ ChatInterface currentChat:",
      foundChat,
      "currentChatId:",
      currentChatId,
      "allChats length:",
      allChats.length,
    );
    return foundChat;
  }, [currentChatId, allChats]);

  /**
   * Create new chat
   * - Auth: creates via Convex mutation
   * - Anon: creates local with share ID
   * - Updates URL for shareable chats
   */
  const handleNewChat = useCallback(
    async (opts?: { userInitiated?: boolean }): Promise<string | null> => {
      const userInitiated = opts?.userInitiated !== false;
      logger.debug("🔍 handleNewChat called", {
        isAuthenticated,
        isCreatingChat,
        userInitiated,
      });
      try {
        if (userInitiated && isCreatingChat) {
          logger.debug("⚠️ Already creating chat, returning early");
          return null;
        }
        if (userInitiated) setIsCreatingChat(true);
        logger.debug("🔄 Setting isCreatingChat to true");
        // Mark that the user explicitly initiated a chat change
        userSelectedChatAtRef.current = Date.now();
        logger.debug(
          "📌 Marked user selected chat at:",
          userSelectedChatAtRef.current,
        );
        let newChatId: string | null = null;

        if (isAuthenticated) {
          logger.debug("🔐 Authenticated user, creating Convex chat");

          // Create optimistic chat for immediate UI update
          const optimisticId = `optimistic_${Date.now()}`;
          const optimisticNewChat: Chat = createLocalChat("New Chat");
          // Override the ID to make it temporary
          (optimisticNewChat as LocalChat)._id = optimisticId;
          setOptimisticChat(optimisticNewChat);

          const chatId = await createChat({
            title: "New Chat",
          });
          newChatId = String(chatId);
          logger.debug("✅ Convex chat created:", chatId);

          // Clear optimistic chat once real chat is created
          setOptimisticChat(null);

          setCurrentChatId(chatId);
          logger.debug("🔄 setCurrentChatId called with:", chatId);
          const navSuccess = await navigateWithVerification(`/chat/${chatId}`);
          if (!navSuccess) {
            logger.error("❌ Failed to navigate to new chat:", chatId);
            // Still return the chat ID as it was created successfully
          }
          logger.debug("🧭 navigate called with:", `/chat/${chatId}`);
          setMessageCount(0);
          logger.debug("🔢 setMessageCount reset to 0");
        } else {
          logger.debug("👤 Unauthenticated user, creating local chat");
          // Create local chat using unified type helper
          const newChat = createLocalChat("New Chat");
          setLocalChats((prev) => [newChat, ...prev]);
          logger.debug("✅ Local chat created:", newChat._id);
          setCurrentChatId(newChat._id);
          logger.debug("🔄 setCurrentChatId called with:", newChat._id);
          const navSuccess = await navigateWithVerification(
            `/chat/${newChat._id}`,
          );
          if (!navSuccess) {
            logger.error(
              "❌ Failed to navigate to new local chat:",
              newChat._id,
            );
            // Still return the chat ID as it was created successfully
          }
          logger.debug("🧭 navigate called with:", `/chat/${newChat._id}`);
          newChatId = newChat._id;
          setMessageCount(0);
          logger.debug("🔢 setMessageCount reset to 0");
        }

        logger.debug("🏁 handleNewChat completed, returning:", newChatId);
        return newChatId;
      } catch (error) {
        console.error("💥 Failed to create chat:", error);
        logger.error("❌ Chat creation failed with error:", error);

        // Show user-friendly error message
        const errorMessage =
          error instanceof Error ? error.message : "Failed to create new chat";
        console.error(`Chat creation error: ${errorMessage}`);

        // TODO: Add toast notification here
        // For now, alert the user
        if (typeof window !== "undefined") {
          alert(
            `Failed to create new chat: ${errorMessage}\n\nPlease try again.`,
          );
        }

        return null;
      } finally {
        // Ensure flag is always cleared even if navigation fails
        if (userInitiated) setIsCreatingChat(false);
        setOptimisticChat(null); // Ensure optimistic chat is cleared
      }
    },
    [
      isCreatingChat,
      isAuthenticated,
      createChat,
      setLocalChats,
      navigateWithVerification,
    ],
  );

  // Create a new chat immediately and navigate to it
  const startNewChatSession = useCallback(async () => {
    logger.debug("🆕 startNewChatSession: Creating new chat immediately");

    // Reset state first
    userSelectedChatAtRef.current = Date.now();
    setMessageCount(0);
    setShowFollowUpPrompt(false);
    setPlannerHint(undefined);
    setPendingMessage("");

    // Create the chat immediately
    const newChatId = await handleNewChat();

    if (!newChatId) {
      logger.error("❌ Failed to create new chat in startNewChatSession");
      // Navigate to home as fallback
      try {
        await navigateWithVerification("/");
      } catch (error) {
        logger.error("❌ Fallback navigation to home failed:", error);
        window.location.href = "/";
      }
    }
    // If successful, handleNewChat already navigated to the new chat
  }, [handleNewChat, navigateWithVerification]);

  // Callback for new chat button: create immediately
  const handleNewChatButton = useCallback(() => {
    logger.debug("🖱️ New Chat button clicked");
    startNewChatSession();
  }, [startNewChatSession]);

  // Always clear creating state once navigate/selection occurs
  useEffect(() => {
    logger.debug("🔄 useEffect: Clear creating state triggered", {
      isCreatingChat,
      currentChatId,
    });
    if (isCreatingChat && currentChatId) {
      logger.debug("✅ Clearing isCreatingChat state");
      setIsCreatingChat(false);
    }
  }, [isCreatingChat, currentChatId]);

  // Function to call AI API directly for unauthenticated users
  // Create a ref to track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Throttled message update
   * - Limits updates to 20/sec max
   * - Prevents UI jank during streaming
   * - Only updates if mounted
   */
  const throttledMessageUpdateCallback = useCallback(
    (
      messageId: string,
      content: string,
      reasoning: string,
      hasStarted: boolean,
    ) => {
      if (!isMountedRef.current) return;
      setLocalMessages((prev) => {
        const idx = prev.findIndex((m) => m._id === messageId);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = {
          ...next[idx],
          content,
          reasoning,
          hasStartedContent: hasStarted,
        };
        return next;
      });
    },
    [setLocalMessages],
  );

  const throttledMessageUpdate = useThrottle(
    throttledMessageUpdateCallback as (...args: unknown[]) => void,
    100,
  );

  // Add abort controller for stream cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reference to send function for follow-up scenarios
  const sendRef = useRef<null | ((m: string) => void)>(null);

  // Small helper to reset follow-up prompt UI
  const resetFollowUp = useCallback(() => {
    setShowFollowUpPrompt(false);
    setPlannerHint(undefined);
  }, []);

  // Helper to maybe show follow-up prompt with cooldown
  const maybeShowFollowUpPrompt = useCallback(
    (chatKey: string, opts?: { reason?: string; confidence?: number }) => {
      const lastPromptAt = lastPromptAtByChat[chatKey] || 0;
      if (Date.now() - lastPromptAt >= PROMPT_COOLDOWN_MS) {
        setPlannerHint(opts);
        setShowFollowUpPrompt(true);
        setLastPromptAtByChat((prev) => ({ ...prev, [chatKey]: Date.now() }));
      }
    },
    [lastPromptAtByChat],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort any ongoing streams when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Generate AI response for anon users
   * - Calls HTTP endpoints (search/scrape/ai)
   * - Streams response via SSE
   * - Updates local storage
   * - Handles errors with detailed debug info
   * @param message - User's message
   * @param chatId - Local chat ID
   */
  const generateUnauthenticatedResponse = useCallback(
    async (message: string, chatId: string) => {
      let searchResults: Array<{
          title: string;
          url: string;
          snippet: string;
          relevanceScore?: number;
        }> = [],
        searchContext = "",
        sources: string[] = [],
        hasRealResults = false,
        searchMethod: "serp" | "openrouter" | "duckduckgo" | "fallback" =
          "fallback";
      try {
        if (abortControllerRef.current)
          try {
            abortControllerRef.current.abort();
          } catch {}
        abortControllerRef.current = new AbortController();
        setSearchProgress({
          stage: "searching",
          message: "Searching the web for relevant information...",
        });
        const searchUrl = resolveApi("/api/search"),
          historyText = localMessages
            .filter((m) => m.chatId === chatId)
            .slice(-8)
            .map((m) => m.content || "")
            .join(" ");
        const freq = new Map<string, number>();
        for (const t of `${historyText} ${message}`
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean))
          if (t.length >= 4 && !STOP_WORDS.has(t))
            freq.set(t, (freq.get(t) || 0) + 1);
        const contextualQuery = `${message} ${Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([w]) => w)
          .join(" ")}`
          .trim()
          .slice(0, 220);
        const searchResponse = await fetchJsonWithRetry(searchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: contextualQuery, maxResults: 5 }),
          signal: abortControllerRef.current?.signal,
          retry: 2,
          retryDelayMs: 400,
        });
        if (!searchResponse) {
          throw new Error("No response from search API");
        }
        logger.debug("🔍", searchResponse.status);
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          searchResults = searchData.results || [];
          hasRealResults = searchData.hasRealResults || false;
          searchMethod = searchData.searchMethod || "fallback";
          if (searchResults.length > 0) {
            setSearchProgress({
              stage: "scraping",
              message: "Reading content from top sources...",
              urls: searchResults.slice(0, 3).map((r) => r.url),
            });
            const contents = await Promise.all(
              searchResults.slice(0, 3).map(async (result) => {
                let host = "unknown";
                try {
                  host = new URL(result.url).hostname;
                } catch {}
                setSearchProgress({
                  stage: "scraping",
                  message: `Reading from ${host}...`,
                  currentUrl: result.url,
                  urls: searchResults.slice(0, 3).map((r) => r.url),
                });
                try {
                  const scrapeResponse = await fetchJsonWithRetry(
                    resolveApi("/api/scrape"),
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: result.url }),
                      signal: abortControllerRef.current?.signal,
                      retry: 1,
                      retryDelayMs: 300,
                    },
                  );
                  if (!scrapeResponse) {
                    throw new Error("No response from scrape API");
                  }
                  if (scrapeResponse.ok) {
                    const content = await scrapeResponse.json();
                    sources.push(result.url);
                    return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
                  }
                } catch {}
                return `Source: ${result.title} (${result.url})\n${result.snippet}`;
              }),
            );
            searchContext = contents.join("\n\n");
            setSearchProgress({
              stage: "analyzing",
              message: "Analyzing information and generating response...",
            });
          }
        } else {
          console.error("Search failed:", searchResponse.status);
          try {
            toast.error(`Web search failed: HTTP ${searchResponse.status}`);
          } catch {}
        }
        setSearchProgress({
          stage: "generating",
          message: "AI is thinking and generating response...",
        });
        let systemPrompt = "You are a helpful AI assistant. ";
        if (hasRealResults && searchContext) {
          systemPrompt += `Use the following search results to inform your response. IMPORTANT: When citing sources, use the domain name in brackets like [example.com] format. Place citations inline immediately after the relevant information.\n\n## Search Results (${searchResults.length} sources found):\n${searchContext}\n\n## Source References (USE THESE DOMAIN CITATIONS):\n`;
          searchResults.forEach((result) => {
            let domain = "unknown";
            try {
              domain = new URL(result.url).hostname.replace("www.", "");
            } catch {}
            systemPrompt += `[${domain}] ${result.title}\n    URL: ${result.url}\n    Snippet: ${result.snippet}\n\n`;
          });
        } else if (!hasRealResults && searchResults.length > 0) {
          systemPrompt += `Limited search results available. Use what's available and supplement with your knowledge.\n\n## Available Results:\n`;
          searchResults.forEach((result) => {
            systemPrompt += `- ${result.title}: ${result.snippet}\n`;
          });
        } else
          systemPrompt +=
            "Web search is unavailable. Provide helpful responses based on your knowledge. ";
        systemPrompt +=
          "\n\nProvide clear, helpful responses. When you reference information from the search results, you MUST include citations using the [domain.com] format shown above. Place citations immediately after the relevant statement. Always format output using strict GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language tags. Avoid arbitrary HTML beyond <u>. This is a continued conversation, so consider the full context of previous messages.";
        const chatHistory = localMessages
          .filter((msg) => msg.chatId === chatId)
          .map((msg) => ({ role: msg.role, content: msg.content || "" }));
        const assistantMessageId = `msg_${Date.now() + 1}`;
        const assistantMessage: LocalMessage = {
          _id: assistantMessageId,
          chatId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          searchResults: searchResults.length > 0 ? searchResults : undefined,
          sources: sources.length > 0 ? sources : undefined,
          reasoning: "",
          searchMethod,
          hasRealResults,
          isStreaming: true,
          hasStartedContent: false,
          isLocal: true,
          source: "local",
        };
        setLocalMessages((prev) => [...prev, assistantMessage]);
        const aiResponse = await fetch(resolveApi("/api/ai"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            message,
            systemPrompt,
            searchResults,
            sources,
            chatHistory,
          }),
          signal: abortControllerRef.current.signal,
        });
        if (aiResponse.ok && aiResponse.body) {
          const contentType = aiResponse.headers.get("content-type");
          if (contentType?.includes("text/event-stream")) {
            const reader = aiResponse.body.getReader(),
              decoder = new TextDecoder();
            let buffer = "",
              accumulatedContent = "",
              accumulatedThinking = "",
              hasStartedContent = false,
              isReading = true;
            const fallbackText = searchResults?.length
              ? `I'm sorry, I couldn't complete the response. Top sources:\n${searchResults
                  .slice(0, 3)
                  .map((r) => `- ${r.title} — ${r.url}`)
                  .join("\n")}`
              : "I'm sorry, I couldn't generate a response this time.";
            if (abortControllerRef.current)
              abortControllerRef.current.signal.addEventListener(
                "abort",
                () => {
                  isReading = false;
                  setLocalMessages((prev) => {
                    const idx = prev.findIndex(
                      (m) => m._id === assistantMessageId,
                    );
                    if (idx === -1) return prev;
                    const next = prev.slice();
                    if (next[idx].content?.trim()) {
                      next[idx] = {
                        ...next[idx],
                        isStreaming: false,
                        hasStartedContent: true,
                      };
                      return next;
                    }
                    next.splice(idx, 1);
                    return next;
                  });
                },
                { once: true },
              );
            try {
              while (isReading && isMountedRef.current) {
                const { done, value } = await reader.read();
                if (done) {
                  if (!accumulatedContent?.trim())
                    accumulatedContent = fallbackText;
                  if (isMountedRef.current)
                    setLocalMessages((prev) =>
                      prev.map((msg) =>
                        msg._id === assistantMessageId
                          ? {
                              ...msg,
                              content: accumulatedContent,
                              reasoning: accumulatedThinking,
                              isStreaming: false,
                              hasStartedContent: true,
                            }
                          : msg,
                      ),
                    );
                  break;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") {
                      if (!accumulatedContent?.trim())
                        accumulatedContent = fallbackText;
                      if (isMountedRef.current)
                        setLocalMessages((prev) =>
                          prev.map((msg) =>
                            msg._id === assistantMessageId
                              ? {
                                  ...msg,
                                  content: accumulatedContent,
                                  reasoning: String(accumulatedThinking || ""),
                                  isStreaming: false,
                                  hasStartedContent: true,
                                }
                              : msg,
                          ),
                        );
                      return;
                    }
                    const chunk = validateStreamChunk(data);
                    if (chunk && chunk.type === "chunk") {
                      if (chunk.thinking)
                        accumulatedThinking += String(chunk.thinking);
                      if (chunk.content) {
                        accumulatedContent += chunk.content;
                        if (!hasStartedContent) hasStartedContent = true;
                      }
                      throttledMessageUpdate(
                        assistantMessageId,
                        accumulatedContent,
                        String(accumulatedThinking || ""),
                        hasStartedContent,
                      );
                    }
                  }
                }
              }
            } catch (streamError) {
              if (
                streamError instanceof Error &&
                streamError.name === "AbortError"
              )
                return;
              if (isMountedRef.current)
                setLocalMessages((prev) =>
                  prev.map((msg) =>
                    msg._id === assistantMessageId
                      ? {
                          ...msg,
                          content:
                            accumulatedContent ||
                            "I apologize, but I encountered an error while streaming the response. Please try again.",
                          isStreaming: false,
                        }
                      : msg,
                  ),
                );
            } finally {
              reader.releaseLock();
            }
          } else {
            const aiData = await aiResponse.json();
            if (isMountedRef.current)
              setLocalMessages((prev) =>
                prev.map((msg) =>
                  msg._id === assistantMessageId
                    ? {
                        ...msg,
                        content:
                          aiData.response ||
                          "I apologize, but I couldn't generate a response. Please try again.",
                        reasoning: aiData.reasoning || null,
                        isStreaming: false,
                      }
                    : msg,
                ),
              );
          }
        } else
          throw new Error(`AI API failed with status ${aiResponse.status}`);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("AI generation failed:", error);
        const errorMessage = `I'm having trouble generating a response. ${searchContext ? `\n\n**Available Content:**\n${searchContext.substring(0, 800)}...\n\n` : ""}**Next Steps:**\n1. Check browser console\n2. Verify API endpoints\n3. Try rephrasing\n4. Check network connectivity`;
        if (isMountedRef.current)
          setLocalMessages((prev) => [
            ...prev,
            {
              _id: `msg_${Date.now() + 1}`,
              chatId,
              role: "assistant",
              content: errorMessage,
              timestamp: Date.now(),
              searchResults:
                searchResults.length > 0 ? searchResults : undefined,
              sources: sources.length > 0 ? sources : undefined,
              searchMethod,
              hasRealResults,
              isLocal: true,
              source: "local",
            },
          ]);
      }
    },
    [
      resolveApi,
      fetchJsonWithRetry,
      localMessages,
      setLocalMessages,
      throttledMessageUpdate,
    ],
  );

  /**
   * Send message handler
   * - Checks msg limits (4 for anon)
   * - Calls planner for topic detection
   * - Routes to auth/anon generation
   * - Updates chat title on first msg
   * @param content - Message content
   */
  const handleSendMessage = useCallback(
    async (content: string) => {
      logger.debug("🚀 handleSendMessage called with:", content);
      // Don't send while an answer is already generating
      if (isGenerating) {
        logger.debug("⚠️ Already generating, skipping send");
        return;
      }
      // If no chat is active yet, create one first then send
      let activeChatId = currentChatId;
      if (!activeChatId) {
        logger.debug("📝 No current chat, creating new chat before sending");
        const newChatId = await handleNewChat();
        if (!newChatId) {
          logger.error("❌ Failed to create chat for message");
          return;
        }
        // Use the newly created chat for this message
        activeChatId = isAuthenticated ? (newChatId as Id<"chats">) : newChatId;
        logger.debug("📝 Using newly created chat:", activeChatId);
      }
      // If a follow-up prompt is visible, do not block normal send; dismiss it
      if (showFollowUpPrompt) {
        logger.debug("-dismissing follow-up prompt");
        resetFollowUp();
        setPendingMessage("");
      }

      // Check message limit for unauthenticated users
      if (!isAuthenticated && messageCount >= 4) {
        onRequestSignUp?.();
        return;
      }

      // New-topic decision: use server planner when authenticated; otherwise fallback heuristic
      const currentMessagesForChat =
        typeof activeChatId === "string"
          ? localMessages.filter((msg) => msg.chatId === activeChatId)
          : messages || [];

      // Do NOT block sending while a suggestion banner is visible.
      // If the banner is already open, bypass gating and proceed to send.
      if (
        !showFollowUpPrompt &&
        isAuthenticated &&
        typeof activeChatId !== "string"
      ) {
        // Client-side gating before planner call
        // Using module-level CHAT_COOLDOWN_MS constant
        const contentTrim = content.trim();
        const words = contentTrim.split(/\s+/).filter(Boolean);
        // Stricter cue detection matching our indicators
        const cue =
          /^(completely different|unrelated|separate topic|new subject|switch to|change to|moving on to|now let's talk about something else|different conversation)/i.test(
            contentTrim,
          );
        let gapMinutes = 0;
        try {
          const prior = (messages || []).filter(
            (m: Message) => m.role === "user",
          );
          const lastUser =
            prior.length > 0 ? prior[prior.length - 1] : undefined;
          if (
            lastUser &&
            typeof (lastUser as unknown as { timestamp?: number }).timestamp ===
              "number"
          ) {
            gapMinutes = Math.floor(
              (Date.now() -
                (lastUser as unknown as { timestamp: number }).timestamp) /
                60000,
            );
          }
        } catch {}
        const shouldPlanBase =
          cue || words.length >= PROMPT_MIN_WORDS || gapMinutes >= 180;
        const chatKey = String(activeChatId);
        const lastAt = lastPlannerCallAtByChat[chatKey] || 0;
        const cooldownPassed = Date.now() - lastAt >= CHAT_COOLDOWN_MS;
        const shouldCallPlanner = shouldPlanBase && cooldownPassed;

        if (shouldCallPlanner) {
          try {
            const plan = await planSearch({
              chatId: activeChatId as Id<"chats">,
              newMessage: content,
              maxContextMessages: 10,
            });
            setLastPlannerCallAtByChat((prev) => ({
              ...prev,
              [chatKey]: Date.now(),
            }));
            if (
              plan?.suggestNewChat &&
              (plan.decisionConfidence ?? 0) >= 0.8 &&
              words.length >= PROMPT_MIN_WORDS
            ) {
              maybeShowFollowUpPrompt(chatKey, {
                reason: plan.reasons,
                confidence: plan.decisionConfidence,
              });
            }
          } catch (e) {
            // If planner fails, fall back to heuristic below
            console.warn("planSearch failed, falling back to heuristic", e);
          }
        } else {
          // If we didn't call planner, still use local heuristic for big topic shifts
          if (
            currentMessagesForChat.length >= 3 &&
            words.length >= PROMPT_MIN_WORDS &&
            isTopicChange(content, currentMessagesForChat as LocalMessage[])
          ) {
            maybeShowFollowUpPrompt(chatKey);
          }
        }
      } else if (!showFollowUpPrompt) {
        const wordsUnauth = content.trim().split(/\s+/).filter(Boolean);
        if (
          currentMessagesForChat.length >= 3 &&
          wordsUnauth.length >= PROMPT_MIN_WORDS &&
          isTopicChange(content, currentMessagesForChat as LocalMessage[])
        ) {
          const chatKeyU = String(activeChatId);
          maybeShowFollowUpPrompt(chatKeyU);
        }
      }

      setIsGenerating(true);
      setSearchProgress({
        stage: "searching",
        message: "Searching the web...",
      });

      try {
        if (isAuthenticated && looksServerId(String(activeChatId))) {
          // Authenticated user - use Convex (without onProgress callback)
          await generateResponse({
            chatId: activeChatId as Id<"chats">,
            message: content,
          });
        } else {
          // Unauthenticated user - add user message to local storage first
          const userMessage = createLocalMessage(
            activeChatId as string,
            "user",
            content,
          );

          setLocalMessages((prev) => [...prev, userMessage]);

          // Update chat title if it's the first message
          if (messageCount === 0) {
            const title =
              content.length > 50 ? `${content.substring(0, 50)}...` : content;
            setLocalChats((prev) =>
              prev.map((chat) =>
                chat._id === activeChatId
                  ? { ...chat, title, updatedAt: Date.now() }
                  : chat,
              ),
            );
          }

          // Generate real AI response for unauthenticated users
          await generateUnauthenticatedResponse(
            content,
            activeChatId as string,
          );
        }

        setMessageCount((prev) => prev + 1);
      } catch (error) {
        console.error("Failed to generate response:", error);

        // Add error message to chat
        const errorMessage: LocalMessage = {
          _id: `msg_${Date.now() + 1}`,
          chatId: activeChatId as string,
          role: "assistant",
          content: `**Error generating response:**\n\n${error instanceof Error ? error.message : "Unknown error occurred"}\n\nPlease try again or rephrase your question.`,
          timestamp: Date.now(),
          isLocal: true,
          source: "local",
        };

        if (typeof activeChatId === "string") {
          setLocalMessages((prev) => [...prev, errorMessage]);
        }
      } finally {
        setIsGenerating(false);
        setSearchProgress(null);
      }
    },
    [
      isGenerating,
      currentChatId,
      handleNewChat,
      showFollowUpPrompt,
      isAuthenticated,
      messageCount,
      onRequestSignUp,
      localMessages,
      messages,
      looksServerId,
      planSearch,
      lastPlannerCallAtByChat,
      isTopicChange,
      generateResponse,
      setLocalMessages,
      setLocalChats,
      generateUnauthenticatedResponse,
      resetFollowUp,
      maybeShowFollowUpPrompt,
    ],
  );

  /**
   * Share chat handler
   * - Updates local chat sharing status
   * - Sets public/private visibility
   * @param isPublic - Public visibility flag
   */
  // Map local messages to export payload shape
  const toExportMessage = useCallback(
    (m: LocalMessage) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      searchResults: m.searchResults,
      sources: m.sources,
      reasoning: m.reasoning as unknown,
      searchMethod: m.searchMethod as unknown,
      hasRealResults: m.hasRealResults,
    }),
    [],
  );

  const handleShare = useCallback(
    async (
      privacy: "private" | "shared" | "public",
    ): Promise<{ shareId?: string; publicId?: string } | undefined> => {
      if (!currentChatId) return;

      // Optimistically navigate to the canonical path for the new privacy
      try {
        const chat = allChats.find(
          (c) => String(c._id) === String(currentChatId),
        );
        if (chat) {
          let path = "";
          if (privacy === "public" && chat.publicId) {
            path = `/p/${chat.publicId}`;
          } else if (privacy === "shared" && chat.shareId) {
            path = `/s/${chat.shareId}`;
          } else {
            path = `/chat/${chat._id}`;
          }
          if (path && path !== window.location.pathname) {
            void navigateWithVerification(path);
          }
        }
      } catch {}

      if (typeof currentChatId === "string") {
        // Handle local chat
        setLocalChats((prev) =>
          prev.map((chat) =>
            chat._id === currentChatId ? { ...chat, privacy } : chat,
          ),
        );
        // If making shared/public, publish anonymously to server so export URLs work
        if (privacy === "shared" || privacy === "public") {
          try {
            const localChat = localChats.find((c) => c._id === currentChatId);
            const msgs = localMessages
              .filter((m) => m.chatId === currentChatId)
              .map(toExportMessage);
            const res = await fetchJsonWithRetry(
              resolveApi("/api/publishChat"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: localChat?.title || "Shared Chat",
                  privacy,
                  shareId: localChat?.shareId,
                  publicId: localChat?.publicId,
                  messages: msgs,
                }),
              },
            );
            if (!res) {
              throw new Error("No response from publish API");
            }
            if (res.ok) {
              const data = await res.json();
              // Update local chat IDs if server had to regenerate to avoid collisions
              setLocalChats((prev) =>
                prev.map((c) =>
                  c._id === currentChatId
                    ? { ...c, shareId: data.shareId, publicId: data.publicId }
                    : c,
                ),
              );
              return {
                shareId: data.shareId as string,
                publicId: data.publicId as string,
              };
            }
          } catch (e) {
            logger.error("Failed to publish anonymous chat", e);
          }
        }
      } else {
        // Handle Convex chat
        try {
          const updated = await updateChatPrivacy({
            chatId: currentChatId,
            privacy,
          });
          // Optimistically merge ids into local view to unblock modal URL building
          setLocalChats((prev) => prev);
          return {
            shareId: updated?.shareId || undefined,
            publicId: updated?.publicId || undefined,
          };
        } catch (e) {
          logger.error("Failed to update privacy", e);
        }
      }
      // Do not forcibly close the modal here; caller decides
    },
    [
      currentChatId,
      allChats,
      setLocalChats,
      updateChatPrivacy,
      navigateWithVerification,
      localChats,
      localMessages,
      fetchJsonWithRetry,
      resolveApi,
      toExportMessage,
    ],
  );

  /**
   * Continue in same chat
   * - Dismisses follow-up prompt
   * - Sends pending message
   * - Uses setTimeout for state sync
   */
  const handleContinueChat = useCallback(() => {
    resetFollowUp();
    // Telemetry: user chose to continue in current chat
    if (isAuthenticated && looksServerId(String(currentChatId))) {
      recordClientMetric({
        name: "user_overrode_prompt",
        chatId: currentChatId as Id<"chats"> | undefined,
      }).catch(() => {});
    }
    // Send the pending message in the current chat
    if (pendingMessage) {
      const tempMessage = pendingMessage;
      setPendingMessage("");
      sendRef.current?.(tempMessage);
    }
  }, [
    pendingMessage,
    isAuthenticated,
    currentChatId,
    recordClientMetric,
    looksServerId,
    resetFollowUp,
  ]);

  /**
   * Start new chat for follow-up
   * - Creates new chat
   * - Waits 500ms for creation
   * - Sends pending message
   */
  const handleNewChatForFollowUp = useCallback(async () => {
    resetFollowUp();
    const tempMessage = pendingMessage;
    setPendingMessage("");
    // Telemetry: user agreed to start new chat
    if (isAuthenticated && looksServerId(String(currentChatId))) {
      recordClientMetric({
        name: "new_chat_confirmed",
        chatId: currentChatId as Id<"chats"> | undefined,
      }).catch(() => {});
    }

    // Create new chat and send message
    const newChatId = await handleNewChat();
    if (newChatId && tempMessage) {
      // Send the message to the new chat
      sendRef.current?.(tempMessage);
    }
  }, [
    pendingMessage,
    handleNewChat,
    isAuthenticated,
    currentChatId,
    recordClientMetric,
    looksServerId,
    resetFollowUp,
  ]);

  // Start new chat with summary: create chat, synthesize prompt with summary + question
  const handleNewChatWithSummary = useCallback(async () => {
    resetFollowUp();
    const tempMessage = pendingMessage;
    setPendingMessage("");

    try {
      // Snapshot the chat we want to summarize BEFORE creating a new one
      const prevChatId = currentChatId;
      let summary = "";
      try {
        if (
          isAuthenticated &&
          prevChatId &&
          looksServerId(String(prevChatId))
        ) {
          summary = await summarizeRecentAction({
            chatId: prevChatId as Id<"chats">,
            limit: 12,
          });
        }
      } catch {}

      // Fallback summary from local messages when unauthenticated
      if (!summary) {
        const msgs =
          typeof prevChatId === "string"
            ? localMessages.filter((m) => m.chatId === prevChatId)
            : [];
        const last = msgs.slice(-12);
        summary = last
          .map(
            (m) =>
              `${m.role === "assistant" ? "Assistant" : "User"}: ${(m.content || "").slice(0, 220)}`,
          )
          .join("\n");
      }

      // Compose first message for the new chat: include brief summary then question
      const composed = summary
        ? `Summary of previous conversation (for context):\n${summary}\n\nQuestion: ${tempMessage || ""}`
        : tempMessage || "";

      // Create destination chat and send composed message
      const newChatId = await handleNewChat();
      if (newChatId && composed) {
        sendRef.current?.(composed);
      }
    } catch (e) {
      console.warn("New chat w/ summary failed", e);
      // Fallback to normal new chat flow
      await handleNewChatForFollowUp();
    }
  }, [
    pendingMessage,
    currentChatId,
    handleNewChatForFollowUp,
    handleNewChat,
    isAuthenticated,
    localMessages,
    summarizeRecentAction,
    looksServerId,
    resetFollowUp,
  ]);

  // Debounced draft analyzer: quick local heuristic, optional planner preflight (not blocking)
  const draftAnalyzerFn = useCallback(
    (draft: string) => {
      try {
        const val = draft.trim();
        if (!val) return;
        if (!currentChatId) return;
        // Skip if identical draft recently
        if (val.slice(0, 160) === lastDraftSeen) return;
        setLastDraftSeen(val.slice(0, 160));

        // Draft-time prompting disabled to reduce sensitivity and distraction
        // We keep the analyzer for potential future lightweight metrics or previews.
        // Reserved for future lightweight draft-time analysis (no-op by design).
      } catch {}
    },
    [currentChatId, lastDraftSeen],
  );

  const draftAnalyzer = useDebounce(
    draftAnalyzerFn as (...args: unknown[]) => void,
    1200,
  );

  // Only forward drafts when meaningful and not generating
  const handleDraftChange = useCallback(
    (draft: string) => {
      if (isGenerating) return;
      if (draft.trim().length < DRAFT_MIN_LENGTH) return; // avoid popping banner on very short drafts
      draftAnalyzer(draft);
    },
    [isGenerating, draftAnalyzer],
  );

  // Keep sendRef in sync with the latest handler after it's defined
  useEffect(() => {
    sendRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Add ref to track if we've attempted auto-creation
  const hasAutoCreatedRef = useRef(false);
  const handleNewChatRef = useRef<typeof handleNewChat>(handleNewChat);

  // Keep handleNewChatRef in sync
  useEffect(() => {
    handleNewChatRef.current = handleNewChat;
  }, [handleNewChat]);

  // Reset auto-creation flag when authentication changes
  useEffect(() => {
    hasAutoCreatedRef.current = false;
    // isAuthenticated is a prop, not state, so it's safe to include
  }, []);

  // Auto-create first chat only if no chats exist and user hasn't selected/navigated
  useEffect(() => {
    logger.debug("🔄 useEffect: Auto-create first chat triggered", {
      allChatsLength: Array.isArray(allChats) ? allChats.length : "not array",
      currentChatId,
      userSelectedChatAtRef: userSelectedChatAtRef.current,
      propChatId,
      propShareId,
      propPublicId,
      isAuthenticated,
      chatsLength: Array.isArray(chats) ? chats.length : "not array",
    });

    const path = window.location.pathname;
    const isChatUrl = path.match(/^\/(chat|s|p)\/[a-zA-Z0-9_]+$/);
    const hasAny = Array.isArray(allChats) && allChats.length > 0;
    const queriesResolved = isAuthenticated ? Array.isArray(chats) : true;

    // Skip if we've already attempted auto-creation or chat is being created
    if (
      hasAutoCreatedRef.current ||
      isCreatingChat ||
      !queriesResolved ||
      userSelectedChatAtRef.current ||
      currentChatId ||
      isChatUrl ||
      propChatId ||
      propShareId ||
      propPublicId ||
      hasAny
    ) {
      logger.debug("⏭️ Skipping auto-create chat due to existing conditions", {
        hasAutoCreated: hasAutoCreatedRef.current,
        isCreatingChat,
      });
      return;
    }

    const t = window.setTimeout(() => {
      const stillHasNone = Array.isArray(allChats) && allChats.length === 0;
      if (
        !userSelectedChatAtRef.current &&
        !currentChatId &&
        stillHasNone &&
        !hasAutoCreatedRef.current &&
        !isCreatingChat
      ) {
        logger.debug("🤖 Auto-creating new chat");
        hasAutoCreatedRef.current = true;
        // Auto-creation should not block manual user creation
        handleNewChatRef.current?.({ userInitiated: false });
      }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [
    isAuthenticated,
    chats,
    allChats,
    currentChatId,
    propChatId,
    propShareId,
    propPublicId,
    isCreatingChat,
    // Removed handleNewChat to avoid infinite loop - using ref instead
  ]);

  // Make Share controls available consistently in UI; the modal/copy logic
  // still validates and will no-op if no chat exists.

  // Migrate any existing local chats/messages after sign-in (once per mount, with backoff on failure)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!localChats || localChats.length === 0) return;
    if (migrationAttemptedRef.current || migratingRef.current) return;
    // Respect failure backoff
    try {
      const retryStr = window.localStorage.getItem(MIGRATION_RETRY_KEY) || "0";
      const retryAt = Number(retryStr) || 0;
      if (Date.now() < retryAt) return;
    } catch {}

    const run = async () => {
      try {
        migratingRef.current = true;
        const payload = localChats.map((chat) => ({
          localId: chat._id,
          title: chat.title || "New Chat",
          privacy: ((chat as unknown as { privacy?: string }).privacy ||
            "private") as "private" | "shared" | "public",
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          shareId: (chat as unknown as { shareId?: string }).shareId,
          publicId: (chat as unknown as { publicId?: string }).publicId,
          messages: localMessages
            .filter((m) => m.chatId === chat._id)
            .map(toExportMessage),
        }));

        if (payload.length === 0) return;

        const mappings = await importLocalChats({
          chats: payload as unknown as Parameters<
            typeof importLocalChats
          >[0]["chats"],
        });

        // If currently viewing a local chat, switch to the imported server chat
        if (typeof currentChatId === "string") {
          const map = mappings.find(
            (m: unknown) =>
              (m as { localId?: string }).localId === currentChatId,
          );
          if (map) {
            setCurrentChatId(map.chatId);
          }
        }

        // Clear local data after successful import
        setLocalChats([]);
        setLocalMessages([]);
      } catch (e) {
        console.warn("Local chat migration failed; preserving local data", e);
        // Set retry backoff
        try {
          window.localStorage.setItem(
            MIGRATION_RETRY_KEY,
            // oxlint-disable-next-line exhaustive-deps
            String(Date.now() + MIGRATION_BACKOFF_MS),
          );
        } catch {}
      } finally {
        migratingRef.current = false;
        // Even if it failed, don't spam attempts in a loop; user can refresh to retry
        migrationAttemptedRef.current = true;
      }
    };

    run();
  }, [
    isAuthenticated,
    localChats,
    localMessages,
    importLocalChats,
    setLocalChats,
    setLocalMessages,
    MIGRATION_RETRY_KEY,
    currentChatId,
    toExportMessage,
  ]);

  // Swipe handlers for mobile
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (window.innerWidth < 1024) {
        if (!sidebarOpen) handleToggleSidebar();
      }
    },
    onSwipedLeft: () => {
      if (window.innerWidth < 1024) {
        if (sidebarOpen) handleToggleSidebar();
      }
    },
    trackMouse: false,
    trackTouch: true,
  });

  return (
    <div
      className="flex-1 flex relative h-full overflow-hidden"
      {...swipeHandlers}
    >
      {/* Desktop Sidebar - Hidden on mobile, conditionally visible on lg+ based on sidebarOpen */}
      {sidebarOpen && (
        <div className="hidden lg:flex lg:flex-shrink-0 desktop-sidebar-container">
          <div className="flex w-80 h-full">
            <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <ChatSidebar
                chats={allChats}
                currentChatId={currentChatId}
                onSelectChat={(id) => {
                  logger.debug("🖱️ Sidebar selected chat", { id });
                  if (id !== null) handleSelectChat(id);
                }}
                onNewChat={startNewChatSession}
                onDeleteLocalChat={handleDeleteLocalChat}
                onRequestDeleteChat={handleRequestDeleteChat}
                isOpen={sidebarOpen}
                onToggle={handleToggleSidebar}
                isCreatingChat={isCreatingChat}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar - Only shown on mobile when open */}
      <MobileSidebar
        isOpen={sidebarOpen}
        onClose={handleMobileSidebarClose}
        chats={allChats}
        currentChatId={currentChatId}
        onSelectChat={(id) => {
          logger.debug("📱 MobileSidebar selected chat", { id });
          if (id !== null) handleSelectChat(id);
        }}
        onNewChat={startNewChatSession}
        onDeleteLocalChat={handleDeleteLocalChat}
        onRequestDeleteChat={handleRequestDeleteChat}
        isCreatingChat={isCreatingChat}
      />

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full">
        <div className="flex-1 flex flex-col min-h-0">
          <MessageList
            key={String(currentChatId)}
            messages={currentMessages}
            isGenerating={isGenerating}
            searchProgress={searchProgress}
            onToggleSidebar={handleToggleSidebar}
            onShare={() => setShowShareModal(true)}
            currentChat={currentChat}
            onDeleteLocalMessage={handleDeleteLocalMessage}
            onRequestDeleteMessage={handleRequestDeleteMessage}
          />
        </div>
        <div className="flex-shrink-0 relative">
          {/* Spacer to prevent overlap with fixed banner */}
          {showFollowUpPrompt && (
            <div aria-hidden="true" className="h-12 sm:h-12"></div>
          )}
          <FollowUpPrompt
            isOpen={showFollowUpPrompt}
            onContinue={handleContinueChat}
            onNewChat={handleNewChatForFollowUp}
            onNewChatWithSummary={handleNewChatWithSummary}
            hintReason={plannerHint?.reason}
            hintConfidence={plannerHint?.confidence}
          />
          {/* Persistent controls aligned with input */}
          <div className="px-4 sm:px-6 mb-2 flex justify-end">
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChatButton}
                disabled={isCreatingChat}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  isCreatingChat ? "Creating new chat..." : "Start a new chat"
                }
                type="button"
              >
                {isCreatingChat ? (
                  <svg
                    className="w-5 h-5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <title>Loading</title>
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path d="M12 2v6l4 2" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <title>New Chat</title>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </button>
              <CopyButton
                text={formatConversationWithSources(
                  currentMessages as Array<{
                    role: "user" | "assistant" | "system";
                    content: string;
                    searchResults?:
                      | { title: string; url: string }[]
                      | undefined;
                    sources?: string[] | undefined;
                  }>,
                )}
                size="md"
                title="Copy entire conversation"
                ariaLabel="Copy entire conversation to clipboard"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              />
              <button
                onClick={() => setShowShareModal(true)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Share this conversation"
                type="button"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <title>Share</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </button>
            </div>
          </div>
          {undoBanner && (
            <div className="px-4 sm:px-6 mb-2 flex justify-center">
              <div className="flex items-center gap-3 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <span>
                  {undoBanner.type === "chat"
                    ? "Chat deleted"
                    : "Message deleted"}
                </span>
                <button
                  type="button"
                  onClick={() => setUndoBanner(null)}
                  className="underline text-sm"
                >
                  Undo
                </button>
              </div>
            </div>
          )}
          <MessageInput
            onSendMessage={handleSendMessage}
            onDraftChange={handleDraftChange}
            disabled={isGenerating}
            placeholder={
              isGenerating ? "AI is working..." : "Ask me anything..."
            }
            history={userHistory}
            key={`input-${String(currentChatId || "root")}`}
          />
        </div>
      </div>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShare={handleShare}
        shareUrl={`${window.location.origin}${chatPath(currentChat, currentChat?._id ?? currentChatId)}`}
        llmTxtUrl={(() => {
          // LLM link is only for shared chats (not public) to avoid indexability
          if (currentChat?.privacy !== "shared" || !currentChat?.shareId)
            return undefined;
          const qp = `shareId=${encodeURIComponent(currentChat.shareId)}`;
          return `${apiBase}/api/chatTextMarkdown?${qp}`;
        })()}
        shareId={currentChat?.shareId}
        publicId={currentChat?.publicId}
        exportBase={`${apiBase}/api/chatTextMarkdown`}
        privacy={currentChat?.privacy || "private"}
      />
    </div>
  );
}
