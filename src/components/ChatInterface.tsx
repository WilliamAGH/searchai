/**
 * Main chat interface with authentication modals and message handling
 * - Orchestrates chats/messages for authenticated and anonymous users
 * - Handles sign-in/sign-up modal separation and switching
 * - Streams AI responses (Convex for auth, HTTP API for anonymous)
 * - Manages local storage for unauthenticated user data
 * - Implements topic change detection and new chat suggestions
 */

import { useAction, useMutation, useQuery } from "convex/react";
import React, { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDebounce, useThrottle } from "../hooks/useDebounce";
import { useRef, useCallback, useMemo } from "react";
import { logger } from "../lib/logger";
import { ChatSidebar } from "./ChatSidebar";
import { looksChatId } from "../lib/utils";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ShareModal } from "./ShareModal";
import { MobileSidebar } from "./MobileSidebar";
import { FollowUpPrompt } from "./FollowUpPrompt";
// Auth modals are centralized in App; ChatInterface requests them via callbacks
import { useSwipeable } from "react-swipeable";
import { useNavigate } from "react-router-dom";

// Topic-change detection constants (made less sensitive)
const TOPIC_CHANGE_SIMILARITY_THRESHOLD = 0.1; // require much lower overlap
const TOPIC_CHANGE_MIN_WORD_LENGTH = 4; // ignore shorter words to reduce noise
const PROMPT_MIN_WORDS = 16; // require substantive input before prompting
const TOPIC_CHANGE_INDICATORS = [
  /^(completely different|unrelated|separate topic|new subject)/i,
  /^(switch to|change to|moving on to)/i,
  /^(now let's talk about something else|different conversation)/i,
];
// Common stop words used when extracting lightweight keywords for search context
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

interface LocalChat {
  _id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isLocal: true;
  shareId?: string;
  isShared?: boolean;
  isPublic?: boolean;
  privacy?: "private" | "shared" | "public";
  publicId?: string;
}

interface LocalMessage {
  _id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  searchResults?: Array<{
    title: string;
    url: string;
    snippet: string;
    relevanceScore?: number;
  }>;
  sources?: string[];
  reasoning?: string;
  searchMethod?: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults?: boolean;
  isStreaming?: boolean;
  hasStartedContent?: boolean;
}

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
  logger.debug("💬 ChatInterface rendered with props:", {
    isAuthenticated,
    propChatId,
    propShareId,
    propPublicId,
    isSidebarOpen,
  });

  // Log when the component is unmounted
  useEffect(() => {
    return () => {
      logger.debug("🧹 ChatInterface unmounted");
    };
  }, []);
  const convexUrl = (import.meta as any).env?.VITE_CONVEX_URL || "";
  const apiBase = convexUrl
    .replace(".convex.cloud", ".convex.site")
    .replace(/\/+$/, "");

  const resolveApi = (path: string) => {
    const segment = path.startsWith("/") ? path.slice(1) : path;
    return apiBase ? `${apiBase}/${segment}` : `/${segment}`;
  };

  const [currentChatId, setCurrentChatId] = useState<
    Id<"chats"> | string | null
  >(null);
  logger.debug("🔄 ChatInterface currentChatId state:", currentChatId);

  // Add a useEffect to monitor currentChatId changes
  useEffect(() => {
    logger.debug("🔄 currentChatId state updated:", currentChatId);
  }, [currentChatId]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [localSidebarOpen, setLocalSidebarOpen] = useState(false);
  // Use prop if provided, otherwise use local state
  const sidebarOpen =
    isSidebarOpen !== undefined ? isSidebarOpen : localSidebarOpen;
  const handleToggleSidebar =
    onToggleSidebar || (() => setLocalSidebarOpen(!localSidebarOpen));
  const [messageCount, setMessageCount] = useState(0);
  // Auth modals are managed by the App; request via callbacks instead
  const [showShareModal, setShowShareModal] = useState(false);
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
  const deleteChat = useMutation(api.chats.deleteChat);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const navigate = useNavigate();
  const userSelectedChatAtRef = useRef<number | null>(null);

  // Local storage for unauthenticated users (scoped per host to avoid env conflation)
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

  // Fallback: migrate legacy keys to namespaced keys (one-time, per origin)
  useEffect(() => {
    try {
      const legacyChats = window.localStorage.getItem("searchai_chats");
      const legacyMsgs = window.localStorage.getItem("searchai_messages");
      const hasNew =
        (localChats?.length ?? 0) > 0 || (localMessages?.length ?? 0) > 0;
      if (!hasNew && (legacyChats || legacyMsgs)) {
        if (legacyChats) {
          try {
            const parsed = JSON.parse(legacyChats);
            if (Array.isArray(parsed)) setLocalChats(parsed);
          } catch {}
        }
        if (legacyMsgs) {
          try {
            const parsed = JSON.parse(legacyMsgs);
            if (Array.isArray(parsed)) setLocalMessages(parsed);
          } catch {}
        }
        // Clear legacy keys after copying
        try {
          window.localStorage.removeItem("searchai_chats");
          window.localStorage.removeItem("searchai_messages");
        } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only query Convex when authenticated and IDs are server-issued
  const looksServerId = looksChatId;

  const chats = useQuery(
    api.chats.getUserChats,
    isAuthenticated ? undefined : "skip",
  );
  const chatByOpaqueId = useQuery(
    api.chats.getChatByOpaqueId,
    isAuthenticated && looksServerId(propChatId)
      ? { chatId: propChatId as Id<"chats"> }
      : "skip",
  );
  const chatByShareId = useQuery(
    api.chats.getChatByShareId,
    propShareId ? { shareId: propShareId } : "skip",
  );
  const chatByPublicId = useQuery(
    api.chats.getChatByPublicId,
    propPublicId ? { publicId: propPublicId } : "skip",
  );

  const messages = useQuery(
    api.chats.getChatMessages,
    currentChatId && looksServerId(String(currentChatId))
      ? { chatId: currentChatId as Id<"chats"> }
      : "skip",
  );

  const createChat = useMutation(api.chats.createChat);
  const updateChatPrivacy = useMutation(api.chats.updateChatPrivacy);
  const importLocalChats = useMutation(api.chats.importLocalChats);
  const generateResponse = useAction(api.ai.generateStreamingResponse);
  const planSearch = useAction(api.search.planSearch);
  const recordClientMetric = useAction(api.search.recordClientMetric);
  const summarizeRecentAction = useAction(api.chats.summarizeRecentAction);
  // no-op placeholder (removed summarizeRecent direct usage)

  // One-per-mount migration guards
  const migrationAttemptedRef = useRef(false);
  const migratingRef = useRef(false);
  const MIGRATION_RETRY_KEY = useMemo(
    () => `${storageNamespace}:migration_retry_at`,
    [storageNamespace],
  );
  const MIGRATION_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Generate unique share ID
   * - Random alphanumeric string
   * - Used for shareable chat URLs
   */
  const generateShareId = useCallback(() => {
    if (
      typeof crypto !== "undefined" &&
      typeof (crypto as any).randomUUID === "function"
    ) {
      return (crypto as any).randomUUID().replace(/-/g, "");
    }
    try {
      const bytes = new Uint8Array(16);
      (crypto as Crypto).getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {}
    // Fallback (lower entropy)
    return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }, []);

  /**
   * Detect topic change between messages
   * - Uses lexical similarity (Jaccard index)
   * - Checks topic change indicators
   * - Returns true only when similarity < TOPIC_CHANGE_SIMILARITY_THRESHOLD
   *   AND an explicit topic-change indicator is present
   * @param newMessage - New message text
   * @param previousMessages - Chat history
   * @returns true if topic changed significantly
   */
  const isTopicChange = useCallback(
    (newMessage: string, previousMessages: LocalMessage[]) => {
      // Don't prompt if there are no previous messages or only one exchange
      if (previousMessages.length < 2) return false;

      // Get the last user message (if any)
      const lastUserMessage = [...previousMessages]
        .reverse()
        .find((m) => m.role === "user");
      if (!lastUserMessage) return false;

      // Simple heuristic: Check if the new message has very different keywords
      // or is asking about something completely different
      const newWords = new Set(
        newMessage
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > TOPIC_CHANGE_MIN_WORD_LENGTH),
      );
      const lastWords = new Set(
        lastUserMessage.content
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > TOPIC_CHANGE_MIN_WORD_LENGTH),
      );

      // Calculate overlap
      const intersection = new Set(
        [...newWords].filter((x) => lastWords.has(x)),
      );
      const similarity =
        intersection.size / Math.max(newWords.size, lastWords.size);

      // If similarity is very low AND we have explicit signals of new topics
      const hasIndicator = TOPIC_CHANGE_INDICATORS.some((pattern) =>
        pattern.test(newMessage),
      );

      // Be conservative: require both conditions
      return similarity < TOPIC_CHANGE_SIMILARITY_THRESHOLD && hasIndicator;
    },
    [],
  );

  // Get all chats (either from Convex or local storage)
  const allChats = useMemo(() => {
    if (isAuthenticated && chats) {
      return chats;
    } else if (!isAuthenticated) {
      return localChats;
    }
    return [];
  }, [isAuthenticated, chats, localChats]);

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
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    // De-duplicate consecutive duplicates
    const deduped: string[] = [];
    for (const s of list) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== s)
        deduped.push(s);
    }
    return deduped;
  }, [currentMessages]);

  // Update URL when chat changes
  useEffect(() => {
    // Don't override currentChatId if user just initiated a chat change
    const recentUserAction =
      userSelectedChatAtRef.current &&
      Date.now() - userSelectedChatAtRef.current < 1000;

    if (recentUserAction) {
      logger.debug("🚫 Skipping URL override due to recent user action");
      return;
    }

    // Only process when we have actual data changes, not on every render
    let newChatId: string | null = null;

    // Priority order: server queries first, then URL params, then local
    if (isAuthenticated) {
      if (chatByOpaqueId && chatByOpaqueId._id !== currentChatId) {
        newChatId = chatByOpaqueId._id;
      } else if (chatByShareId && chatByShareId._id !== currentChatId) {
        newChatId = chatByShareId._id;
      } else if (chatByPublicId && chatByPublicId._id !== currentChatId) {
        newChatId = chatByPublicId._id;
      } else if (
        propChatId &&
        looksServerId(propChatId) &&
        propChatId !== currentChatId
      ) {
        newChatId = propChatId;
      }
    } else {
      // For unauthenticated users, check URL params against local chats
      if (propChatId) {
        const localChat = localChats.find((chat) => chat._id === propChatId);
        if (localChat && localChat._id !== currentChatId) {
          newChatId = localChat._id;
        }
      } else if (propShareId) {
        const localChat = localChats.find(
          (chat) => chat.shareId === propShareId,
        );
        if (localChat && localChat._id !== currentChatId) {
          newChatId = localChat._id;
        }
      } else if (propPublicId) {
        const localChat = localChats.find(
          (chat) => chat.publicId === propPublicId,
        );
        if (localChat && localChat._id !== currentChatId) {
          newChatId = localChat._id;
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
    propShareId,
    propPublicId,
    localChats,
    currentChatId,
  ]);

  const hasSetInitialUrlRef = useRef(false);
  useEffect(() => {
    if (!currentChatId) return;
    const chat = allChats.find((c) => String(c._id) === String(currentChatId));

    if (chat) {
      let path = "";
      if (chat.privacy === "public" && chat.publicId) {
        path = `/p/${chat.publicId}`;
      } else if (chat.privacy === "shared" && chat.shareId) {
        path = `/s/${chat.shareId}`;
      } else {
        path = `/chat/${chat._id}`;
      }
      if (path !== window.location.pathname) {
        if (!hasSetInitialUrlRef.current) {
          navigate(path, { replace: true });
          hasSetInitialUrlRef.current = true;
        } else {
          navigate(path);
        }
      }
    } else {
      // Fallback for a newly created chat that is not yet in `allChats`
      const path = `/chat/${currentChatId}`;
      if (path !== window.location.pathname) navigate(path);
    }
  }, [currentChatId, allChats, navigate]);

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
  const handleNewChat = useCallback(async (): Promise<string | null> => {
    logger.debug("🔍 handleNewChat called", {
      isAuthenticated,
      isCreatingChat,
    });
    try {
      if (isCreatingChat) {
        logger.debug("⚠️ Already creating chat, returning early");
        return null;
      }
      setIsCreatingChat(true);
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
        const chatId = await createChat({
          title: "New Chat",
        });
        newChatId = String(chatId);
        logger.debug("✅ Convex chat created:", chatId);
        setCurrentChatId(chatId);
        logger.debug("🔄 setCurrentChatId called with:", chatId);
        navigate(`/chat/${chatId}`);
        logger.debug("🧭 navigate called with:", `/chat/${chatId}`);
        setMessageCount(0);
        logger.debug("🔢 setMessageCount reset to 0");
      } else {
        logger.debug("👤 Unauthenticated user, creating local chat");
        // Create local chat with unique share ID
        const shareId = generateShareId();
        const newChat: LocalChat = {
          _id: `local_${Date.now()}`,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isLocal: true,
          shareId,
          publicId: generateShareId(), // Also generate a public ID
          privacy: "private",
        };
        setLocalChats((prev) => [newChat, ...prev]);
        logger.debug("✅ Local chat created:", newChat._id);
        setCurrentChatId(newChat._id);
        logger.debug("🔄 setCurrentChatId called with:", newChat._id);
        navigate(`/chat/${newChat._id}`);
        logger.debug("🧭 navigate called with:", `/chat/${newChat._id}`);
        newChatId = newChat._id;
        setMessageCount(0);
        logger.debug("🔢 setMessageCount reset to 0");
      }

      logger.debug("🏁 handleNewChat completed, returning:", newChatId);
      return newChatId;
    } catch (error) {
      console.error("💥 Failed to create chat:", error);
      setIsCreatingChat(false);
    }
    logger.debug("🏁 handleNewChat returning null");
    return null;
  }, [
    isCreatingChat,
    isAuthenticated,
    createChat,
    setLocalChats,
    generateShareId,
    navigate,
    setMessageCount,
  ]);

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
  const throttledMessageUpdate = useThrottle(
    useCallback(
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
    ),
    100,
  );

  // Add abort controller for stream cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Deterministic post-create send flow (replaces setTimeout-based races)
  const pendingSendRef = useRef<string | null>(null);
  const awaitingNewChatRef = useRef<boolean>(false);
  const sendRef = useRef<null | ((m: string) => void)>(null);
  useEffect(() => {
    logger.debug(
      "🔄 useEffect: Deterministic post-create send flow triggered",
      {
        awaitingNewChatRef: awaitingNewChatRef.current,
        currentChatId,
        pendingSendRef: pendingSendRef.current,
      },
    );
    if (!awaitingNewChatRef.current) return;
    if (!currentChatId) return;
    const msg = pendingSendRef.current;
    if (!msg) return;
    // Clear first to avoid re-entrancy
    awaitingNewChatRef.current = false;
    pendingSendRef.current = null;
    // Send into the newly created chat id (currentChatId is now set)
    logger.debug("📤 Sending pending message:", msg);
    sendRef.current?.(msg);
  }, [currentChatId]);

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
  const generateUnauthenticatedResponse = async (
    message: string,
    chatId: string,
  ) => {
    let searchResults: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore?: number;
    }> = [];
    let searchContext = "";
    const sources: string[] = [];
    let hasRealResults = false;
    let searchMethod: "serp" | "openrouter" | "duckduckgo" | "fallback" =
      "fallback";
    const errorDetails: string[] = [];

    try {
      // Create/replace abort controller for the full generation pipeline (search→scrape→AI)
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch {}
      }
      abortControllerRef.current = new AbortController();

      // Step 1: Search the web
      setSearchProgress({
        stage: "searching",
        message: "Searching the web for relevant information...",
      });

      const searchUrl = resolveApi("/api/search");
      logger.debug("🔍 SEARCH API REQUEST:");
      logger.debug("URL:", searchUrl);
      logger.debug("Method:", "POST");
      // Avoid logging raw user input in dev
      logger.debug("Body:", { queryLength: message.length, maxResults: 5 });

      const searchStartTime = Date.now();
      // Build a context-aware query by appending a few keywords from recent history
      const historyText = localMessages
        .filter((m) => m.chatId === chatId)
        .slice(-8)
        .map((m) => m.content || "")
        .join(" ");
      const kw = (txt: string) =>
        txt
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
      const freq = new Map<string, number>();
      for (const t of kw(historyText + " " + message)) {
        if (t.length < 4 || STOP_WORDS.has(t)) continue;
        freq.set(t, (freq.get(t) || 0) + 1);
      }
      const top = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([w]) => w);
      const contextualQuery = `${message} ${top.join(" ")}`
        .trim()
        .slice(0, 220);

      const searchResponse = await fetch(searchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: contextualQuery, maxResults: 5 }),
        signal: abortControllerRef.current?.signal,
      });
      const searchDuration = Date.now() - searchStartTime;

      logger.debug("🔍 SEARCH API RESPONSE:");
      logger.debug("Status:", searchResponse.status);
      logger.debug("Duration:", `${searchDuration}ms`);
      logger.debug("Headers: <omitted>");

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        logger.debug(
          "🔍 SEARCH API RESPONSE BODY:",
          JSON.stringify(searchData, null, 2),
        );

        searchResults = searchData.results || [];
        hasRealResults = searchData.hasRealResults || false;
        searchMethod = searchData.searchMethod || "fallback";

        if (searchResults.length > 0) {
          setSearchProgress({
            stage: "scraping",
            message: "Reading content from top sources...",
            urls: searchResults.slice(0, 3).map((r) => r.url),
          });

          // Step 2: Scrape content from top results
          const contentPromises = searchResults
            .slice(0, 3)
            .map(
              async (result: {
                url: string;
                title: string;
                snippet: string;
              }) => {
                let host = "unknown";
                try {
                  host = new URL(result.url).hostname;
                } catch {
                  /* noop */
                }
                setSearchProgress({
                  stage: "scraping",
                  message: `Reading content from ${host}...`,
                  currentUrl: result.url,
                  urls: searchResults.slice(0, 3).map((r) => r.url),
                });

                try {
                  const scrapeUrl = resolveApi("/api/scrape");
                  logger.debug("🌐 SCRAPE API REQUEST:");
                  logger.debug("URL:", scrapeUrl);
                  logger.debug("Method:", "POST");
                  logger.debug("Body:", { urlLength: result.url?.length ?? 0 });

                  const scrapeStartTime = Date.now();
                  const scrapeResponse = await fetch(scrapeUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: result.url }),
                    signal: abortControllerRef.current?.signal,
                  });
                  const scrapeDuration = Date.now() - scrapeStartTime;

                  logger.debug("🌐 SCRAPE API RESPONSE:");
                  logger.debug("Status:", scrapeResponse.status);
                  logger.debug("Duration:", `${scrapeDuration}ms`);
                  logger.debug("URL:", result.url);

                  if (scrapeResponse.ok) {
                    const content = await scrapeResponse.json();
                    logger.debug(
                      "🌐 SCRAPE API RESPONSE BODY:",
                      JSON.stringify(content, null, 2),
                    );
                    sources.push(result.url);
                    return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
                  } else {
                    const errorText = await scrapeResponse.text();
                    console.error("🌐 SCRAPE API ERROR:", {
                      status: scrapeResponse.status,
                      statusText: scrapeResponse.statusText,
                      error: errorText,
                      url: result.url,
                      timestamp: new Date().toISOString(),
                    });
                    errorDetails.push(
                      `Scraping failed for ${result.url}: HTTP ${scrapeResponse.status} ${scrapeResponse.statusText} - ${errorText}`,
                    );
                    return `Source: ${result.title} (${result.url})\n${result.snippet}`;
                  }
                } catch (error) {
                  console.error("🌐 SCRAPE API EXCEPTION:", {
                    error:
                      error instanceof Error ? error.message : "Unknown error",
                    stack:
                      error instanceof Error ? error.stack : "No stack trace",
                    url: result.url,
                    timestamp: new Date().toISOString(),
                  });
                  errorDetails.push(
                    `Scraping error for ${result.url}: ${error instanceof Error ? error.message : "Unknown error"}`,
                  );
                  return `Source: ${result.title} (${result.url})\n${result.snippet}`;
                }
              },
            );

          const contents = await Promise.all(contentPromises);
          searchContext = contents.join("\n\n");

          setSearchProgress({
            stage: "analyzing",
            message: "Analyzing information and generating response...",
          });
        }
      } else {
        const errorText = await searchResponse.text();
        console.error("🔍 SEARCH API ERROR:", {
          status: searchResponse.status,
          statusText: searchResponse.statusText,
          error: errorText,
          timestamp: new Date().toISOString(),
        });
        errorDetails.push(
          `Search API failed: HTTP ${searchResponse.status} ${searchResponse.statusText} - ${errorText}`,
        );
      }

      setSearchProgress({
        stage: "generating",
        message: "AI is thinking and generating response...",
      });

      // Generate AI response with streaming - include ALL context
      let systemPrompt = `You are a helpful AI assistant. `;

      if (hasRealResults && searchContext) {
        systemPrompt += `Use the following search results to inform your response. IMPORTANT: When citing sources, use the domain name in brackets like [example.com] format. Place citations inline immediately after the relevant information.\n\n`;
        systemPrompt += `## Search Results (${searchResults.length} sources found):\n${searchContext}\n\n`;
        systemPrompt += `## Source References (USE THESE DOMAIN CITATIONS):\n`;
        searchResults.forEach(
          (
            result: { title: string; url: string; snippet: string },
            _idx: number,
          ) => {
            let domain = "unknown";
            try {
              domain = new URL(result.url).hostname.replace("www.", "");
            } catch {}
            systemPrompt += `[${domain}] ${result.title}\n    URL: ${result.url}\n    Snippet: ${result.snippet}\n\n`;
          },
        );
      } else if (!hasRealResults && searchResults.length > 0) {
        systemPrompt += `Limited search results available. Use what's available and supplement with your knowledge.\n\n`;
        systemPrompt += `## Available Results:\n`;
        searchResults.forEach((result: { title: string; snippet: string }) => {
          systemPrompt += `- ${result.title}: ${result.snippet}\n`;
        });
      } else {
        systemPrompt += `Web search is unavailable. Provide helpful responses based on your knowledge. `;
      }

      systemPrompt += `\n\nProvide clear, helpful responses. When you reference information from the search results, you MUST include citations using the [domain.com] format shown above. Place citations immediately after the relevant statement. Always format output using strict GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language tags. Avoid arbitrary HTML beyond <u>. This is a continued conversation, so consider the full context of previous messages.`;

      // Get chat history for context
      const chatHistory = localMessages
        .filter((msg) => msg.chatId === chatId)
        .map((msg) => ({
          role: msg.role,
          content: msg.content || "",
        }));

      const aiRequestBody = {
        message,
        systemPrompt,
        searchResults,
        sources,
        chatHistory,
      };

      const aiUrl = resolveApi("/api/ai");
      logger.debug("🤖 AI API REQUEST:");
      logger.debug("URL:", aiUrl);
      logger.debug("Method:", "POST");
      // Do not log full bodies with user content/history
      logger.debug("Body:", {
        messageLength: aiRequestBody.message.length,
        searchResults: aiRequestBody.searchResults?.length ?? 0,
        sources: aiRequestBody.sources?.length ?? 0,
        historySize: aiRequestBody.chatHistory?.length ?? 0,
      });

      // Create placeholder assistant message for streaming
      const assistantMessageId = `msg_${Date.now() + 1}`;
      const assistantMessage: LocalMessage = {
        _id: assistantMessageId,
        chatId: chatId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        searchResults: searchResults.length > 0 ? searchResults : undefined,
        sources: sources.length > 0 ? sources : undefined,
        reasoning: "",
        searchMethod: searchMethod,
        hasRealResults: hasRealResults,
        isStreaming: true,
        hasStartedContent: false,
      };

      setLocalMessages((prev) => [...prev, assistantMessage]);

      const aiStartTime = Date.now();
      const aiResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(aiRequestBody),
        signal: abortControllerRef.current.signal,
      });
      const aiDuration = Date.now() - aiStartTime;

      logger.debug("🤖 AI API RESPONSE:");
      logger.debug("Status:", aiResponse.status);
      logger.debug("Duration:", `${aiDuration}ms`);
      logger.debug(
        "Headers:",
        Object.fromEntries(aiResponse.headers.entries()),
      );

      if (aiResponse.ok && aiResponse.body) {
        const contentType = aiResponse.headers.get("content-type");

        if (contentType?.includes("text/event-stream")) {
          // Handle streaming response properly
          const reader = aiResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accumulatedContent = "";
          let accumulatedThinking = "";
          let hasStartedContent = false;
          let chunkCount = 0;
          const streamStartTime = Date.now();

          let isReading = true;

          // Listen for abort signal
          if (abortControllerRef.current) {
            abortControllerRef.current.signal.addEventListener(
              "abort",
              () => {
                isReading = false;
                // Gracefully finalize or remove the placeholder to avoid spinner hang
                setLocalMessages((prev) => {
                  const idx = prev.findIndex(
                    (m) => m._id === assistantMessageId,
                  );
                  if (idx === -1) return prev;
                  const next = prev.slice();
                  const hadContent = !!next[idx].content?.trim();
                  if (hadContent) {
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
          }

          try {
            while (isReading && isMountedRef.current) {
              const { done, value } = await reader.read();
              if (done) {
                // If the model streamed no visible content, fall back to a concise answer
                if (
                  !accumulatedContent ||
                  accumulatedContent.trim().length === 0
                ) {
                  if (searchResults && searchResults.length > 0) {
                    const topFew = searchResults
                      .slice(0, 3)
                      .map((r) => `- ${r.title} — ${r.url}`)
                      .join("\n");
                    accumulatedContent = `I'm sorry, I couldn't complete the streamed response. Here are top sources that may help:\n\n${topFew}`;
                  } else {
                    accumulatedContent =
                      "I'm sorry, I couldn't generate a response this time.";
                  }
                }
                logger.debug("🔄 Streaming completed:", {
                  totalChunks: chunkCount,
                  duration: Date.now() - streamStartTime,
                  finalContentLength: accumulatedContent.length,
                  timestamp: new Date().toISOString(),
                });
                // Finalize the message only if component is still mounted
                if (isMountedRef.current) {
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
                }
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);
                  if (data === "[DONE]") {
                    if (
                      !accumulatedContent ||
                      accumulatedContent.trim().length === 0
                    ) {
                      if (searchResults && searchResults.length > 0) {
                        const topFew = searchResults
                          .slice(0, 3)
                          .map((r) => `- ${r.title} — ${r.url}`)
                          .join("\n");
                        accumulatedContent = `I'm sorry, I couldn't complete the streamed response. Here are top sources that may help:\n\n${topFew}`;
                      } else {
                        accumulatedContent =
                          "I'm sorry, I couldn't generate a response this time.";
                      }
                    }
                    logger.debug("✅ Streaming finished with [DONE]");
                    // Finalize the message only if component is still mounted
                    if (isMountedRef.current) {
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
                    }
                    return;
                  }
                  try {
                    chunkCount++;
                    const chunk = JSON.parse(data);
                    if (chunk.type === "chunk") {
                      if (chunk.thinking) {
                        // Some providers may send non-string reasoning; normalize
                        accumulatedThinking += String(chunk.thinking);
                      }
                      if (chunk.content) {
                        accumulatedContent += chunk.content;
                        if (!hasStartedContent) {
                          hasStartedContent = true;
                        }
                      }

                      // Update the message in real-time using throttled update
                      throttledMessageUpdate(
                        assistantMessageId,
                        accumulatedContent,
                        String(accumulatedThinking || ""),
                        hasStartedContent,
                      );
                    }
                  } catch (e) {
                    console.error("❌ Failed to parse stream chunk:", {
                      error:
                        e instanceof Error
                          ? e.message
                          : "Unknown parsing error",
                      chunk: data,
                      chunkNumber: chunkCount,
                      timestamp: new Date().toISOString(),
                    });
                  }
                }
              }
            }
          } catch (streamError) {
            // Check if error is due to abort
            if (
              streamError instanceof Error &&
              streamError.name === "AbortError"
            ) {
              logger.debug(
                "Stream aborted (component unmounted or navigation)",
              );
              return; // Don't show error message for intentional aborts
            }

            console.error("💥 Stream reading error:", {
              error:
                streamError instanceof Error
                  ? streamError.message
                  : "Unknown streaming error",
              stack:
                streamError instanceof Error
                  ? streamError.stack
                  : "No stack trace",
              duration: Date.now() - streamStartTime,
              chunkCount: chunkCount,
              timestamp: new Date().toISOString(),
            });
            // Fallback to error message only if component is still mounted
            if (isMountedRef.current) {
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
            }
          } finally {
            reader.releaseLock();
          }
        } else {
          // Fallback to non-streaming response
          const aiData = await aiResponse.json();
          logger.debug(
            "🤖 AI API RESPONSE BODY:",
            JSON.stringify(aiData, null, 2),
          );

          const responseContent =
            aiData.response ||
            "I apologize, but I couldn't generate a response. Please try again.";
          const reasoningTokens = aiData.reasoning || null;

          // Update the placeholder message only if component is still mounted
          if (isMountedRef.current) {
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg._id === assistantMessageId
                  ? {
                      ...msg,
                      content: responseContent,
                      reasoning: reasoningTokens,
                      isStreaming: false,
                    }
                  : msg,
              ),
            );
          }
        }
      } else {
        const aiErrorData = await aiResponse.text();
        console.error("🤖 AI API ERROR:", {
          status: aiResponse.status,
          statusText: aiResponse.statusText,
          error: aiErrorData,
          duration: aiDuration,
          timestamp: new Date().toISOString(),
        });
        errorDetails.push(
          `AI API failed: HTTP ${aiResponse.status} ${aiResponse.statusText}`,
        );
        errorDetails.push(`AI error details: ${aiErrorData}`);
        throw new Error(
          `AI API failed with status ${aiResponse.status} ${aiResponse.statusText}`,
        );
      }
    } catch (error) {
      // Check if error is due to abort
      if (error instanceof Error && error.name === "AbortError") {
        logger.debug("Request aborted (component unmounted or navigation)");
        return; // Don't show error message for intentional aborts
      }

      console.error("💥 AI generation failed with exception:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : "No stack trace",
        timestamp: new Date().toISOString(),
      });

      // Create detailed error message with all the debugging info
      let errorMessage =
        "I'm having trouble generating a response. Here's the detailed debugging information:\n\n";

      errorMessage += "**🔍 SEARCH DEBUG INFO:**\n";
      errorMessage += `- Search Method: ${searchMethod}\n`;
      errorMessage += `- Results Found: ${searchResults.length}\n`;
      errorMessage += `- Real Results: ${hasRealResults ? "Yes" : "No"}\n`;
      errorMessage += `- Sources: ${sources.length}\n\n`;

      if (errorDetails.length > 0) {
        errorMessage += "**❌ ERROR DETAILS:**\n";
        errorDetails.forEach((detail, index) => {
          errorMessage += `${index + 1}. ${detail}\n`;
        });
        errorMessage += "\n";
      }

      // Environment diagnostics are dev-only to protect user privacy
      if ((import.meta as any)?.env?.DEV) {
        console.debug("ENV CHECK:", {
          url: window.location.href,
          ua: navigator.userAgent,
          ts: new Date().toISOString(),
        });
      }

      if (searchContext) {
        errorMessage += "**📄 AVAILABLE CONTENT:**\n";
        errorMessage += `${searchContext.substring(0, 800)}...\n\n`;
      }

      errorMessage += "**🔧 NEXT STEPS:**\n";
      errorMessage += "1. Check browser console for detailed API logs\n";
      errorMessage += "2. Verify API endpoints are accessible\n";
      errorMessage += "3. Try rephrasing your question\n";
      errorMessage += "4. Check network connectivity\n";

      const aiMessage: LocalMessage = {
        _id: `msg_${Date.now() + 1}`,
        chatId: chatId,
        role: "assistant",
        content: errorMessage,
        timestamp: Date.now(),
        searchResults: searchResults.length > 0 ? searchResults : undefined,
        sources: sources.length > 0 ? sources : undefined,
        searchMethod: searchMethod,
        hasRealResults: hasRealResults,
      };

      if (isMountedRef.current) {
        setLocalMessages((prev) => [...prev, aiMessage]);
      }
    }
  };

  /**
   * Send message handler
   * - Checks msg limits (4 for anon)
   * - Calls planner for topic detection
   * - Routes to auth/anon generation
   * - Updates chat title on first msg
   * @param content - Message content
   */
  const handleSendMessage = async (content: string) => {
    logger.debug("🚀 handleSendMessage called with:", content);
    // Don't send while an answer is already generating
    if (isGenerating) {
      logger.debug("⚠️ Already generating, skipping send");
      return;
    }
    // If no chat is active yet, create one and queue this send
    if (!currentChatId) {
      logger.debug(
        "📝 No current chat, queueing message and creating new chat",
      );
      pendingSendRef.current = content;
      awaitingNewChatRef.current = true;
      await handleNewChat();
      return;
    }
    // If a follow-up prompt is visible, do not block normal send; dismiss it
    if (showFollowUpPrompt) {
      logger.debug("-dismissing follow-up prompt");
      setShowFollowUpPrompt(false);
      setPlannerHint(undefined);
      setPendingMessage("");
    }

    // Check message limit for unauthenticated users
    if (!isAuthenticated && messageCount >= 4) {
      onRequestSignUp?.();
      return;
    }

    // New-topic decision: use server planner when authenticated; otherwise fallback heuristic
    const currentMessagesForChat =
      typeof currentChatId === "string"
        ? localMessages.filter((msg) => msg.chatId === currentChatId)
        : messages || [];

    // Do NOT block sending while a suggestion banner is visible.
    // If the banner is already open, bypass gating and proceed to send.
    if (
      !showFollowUpPrompt &&
      isAuthenticated &&
      typeof currentChatId !== "string"
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
        const prior = (messages || []).filter((m) => m.role === "user");
        const lastUser = prior.length > 0 ? prior[prior.length - 1] : undefined;
        if (lastUser && typeof (lastUser as any).timestamp === "number") {
          gapMinutes = Math.floor(
            (Date.now() - (lastUser as any).timestamp) / 60000,
          );
        }
      } catch {}
      const shouldPlanBase =
        cue || words.length >= PROMPT_MIN_WORDS || gapMinutes >= 180;
      const chatKey = String(currentChatId);
      const lastAt = lastPlannerCallAtByChat[chatKey] || 0;
      const cooldownPassed = Date.now() - lastAt >= CHAT_COOLDOWN_MS;
      const shouldCallPlanner = shouldPlanBase && cooldownPassed;

      if (shouldCallPlanner) {
        try {
          const plan = await planSearch({
            chatId: currentChatId,
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
            const lastPromptAt = lastPromptAtByChat[chatKey] || 0;
            if (Date.now() - lastPromptAt >= PROMPT_COOLDOWN_MS) {
              // Non-blocking banner: show suggestion but do not prevent sending
              setPlannerHint({
                reason: plan.reasons,
                confidence: plan.decisionConfidence,
              });
              setShowFollowUpPrompt(true);
              setLastPromptAtByChat((prev) => ({
                ...prev,
                [chatKey]: Date.now(),
              }));
            }
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
          isTopicChange(content, currentMessagesForChat)
        ) {
          const lastPromptAt = lastPromptAtByChat[chatKey] || 0;
          if (Date.now() - lastPromptAt >= PROMPT_COOLDOWN_MS) {
            // Non-blocking banner: show suggestion but do not prevent sending
            setPlannerHint(undefined);
            setShowFollowUpPrompt(true);
            setLastPromptAtByChat((prev) => ({
              ...prev,
              [chatKey]: Date.now(),
            }));
          }
        }
      }
    } else if (!showFollowUpPrompt) {
      const wordsUnauth = content.trim().split(/\s+/).filter(Boolean);
      if (
        currentMessagesForChat.length >= 3 &&
        wordsUnauth.length >= PROMPT_MIN_WORDS &&
        isTopicChange(content, currentMessagesForChat)
      ) {
        const chatKeyU = String(currentChatId);
        const lastPromptAt = lastPromptAtByChat[chatKeyU] || 0;
        if (Date.now() - lastPromptAt >= PROMPT_COOLDOWN_MS) {
          // Non-blocking banner for unauthenticated users too
          setPlannerHint(undefined);
          setShowFollowUpPrompt(true);
          setLastPromptAtByChat((prev) => ({
            ...prev,
            [chatKeyU]: Date.now(),
          }));
        }
      }
    }

    setIsGenerating(true);
    setSearchProgress({ stage: "searching", message: "Searching the web..." });

    try {
      if (isAuthenticated && looksServerId(String(currentChatId))) {
        // Authenticated user - use Convex (without onProgress callback)
        await generateResponse({
          chatId: currentChatId as Id<"chats">,
          message: content,
        });
      } else {
        // Unauthenticated user - add user message to local storage first
        const userMessage: LocalMessage = {
          _id: `msg_${Date.now()}`,
          chatId: currentChatId as string,
          role: "user",
          content,
          timestamp: Date.now(),
        };

        setLocalMessages((prev) => [...prev, userMessage]);

        // Update chat title if it's the first message
        if (messageCount === 0) {
          const title =
            content.length > 50 ? `${content.substring(0, 50)}...` : content;
          setLocalChats((prev) =>
            prev.map((chat) =>
              chat._id === currentChatId
                ? { ...chat, title, updatedAt: Date.now() }
                : chat,
            ),
          );
        }

        // Generate real AI response for unauthenticated users
        await generateUnauthenticatedResponse(content, currentChatId as string);
      }

      setMessageCount((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to generate response:", error);

      // Add error message to chat
      const errorMessage: LocalMessage = {
        _id: `msg_${Date.now() + 1}`,
        chatId: currentChatId as string,
        role: "assistant",
        content: `**Error generating response:**\n\n${error instanceof Error ? error.message : "Unknown error occurred"}\n\nPlease try again or rephrase your question.`,
        timestamp: Date.now(),
      };

      if (typeof currentChatId === "string") {
        setLocalMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsGenerating(false);
      setSearchProgress(null);
    }
  };

  /**
   * Share chat handler
   * - Updates local chat sharing status
   * - Sets public/private visibility
   * @param isPublic - Public visibility flag
   */
  const handleShare = async (privacy: "private" | "shared" | "public") => {
    if (!currentChatId) return;

    if (typeof currentChatId === "string") {
      // Handle local chat
      setLocalChats((prev) =>
        prev.map((chat) =>
          chat._id === currentChatId ? { ...chat, privacy } : chat,
        ),
      );
    } else {
      // Handle Convex chat
      try {
        await updateChatPrivacy({ chatId: currentChatId, privacy });
      } catch (e) {
        logger.error("Failed to update privacy", e);
      }
    }
    setShowShareModal(false);
  };

  /**
   * Continue in same chat
   * - Dismisses follow-up prompt
   * - Sends pending message
   * - Uses setTimeout for state sync
   */
  const handleContinueChat = useCallback(() => {
    setShowFollowUpPrompt(false);
    setPlannerHint(undefined);
    // Telemetry: user chose to continue in current chat
    if (isAuthenticated && looksServerId(String(currentChatId))) {
      recordClientMetric({
        name: "user_overrode_prompt",
        chatId: currentChatId,
      }).catch(() => {});
    }
    // Send the pending message in the current chat
    if (pendingMessage) {
      const tempMessage = pendingMessage;
      setPendingMessage("");
      handleSendMessage(tempMessage);
    }
  }, [
    pendingMessage,
    isAuthenticated,
    currentChatId,
    recordClientMetric,
    handleSendMessage,
  ]);

  /**
   * Start new chat for follow-up
   * - Creates new chat
   * - Waits 500ms for creation
   * - Sends pending message
   */
  const handleNewChatForFollowUp = useCallback(async () => {
    setShowFollowUpPrompt(false);
    setPlannerHint(undefined);
    const tempMessage = pendingMessage;
    setPendingMessage("");
    // Telemetry: user agreed to start new chat
    if (isAuthenticated && looksServerId(String(currentChatId))) {
      recordClientMetric({
        name: "new_chat_confirmed",
        chatId: currentChatId,
      }).catch(() => {});
    }

    // Create new chat and send message
    if (tempMessage) {
      pendingSendRef.current = tempMessage;
      awaitingNewChatRef.current = true;
    }
    await handleNewChat();
  }, [
    pendingMessage,
    handleNewChat,
    isAuthenticated,
    currentChatId,
    recordClientMetric,
    handleSendMessage,
  ]);

  // Start new chat with summary: create chat, synthesize prompt with summary + question
  const handleNewChatWithSummary = useCallback(async () => {
    setShowFollowUpPrompt(false);
    setPlannerHint(undefined);
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
            chatId: prevChatId,
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
              `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content.slice(0, 220)}`,
          )
          .join("\n");
      }

      // Compose first message for the new chat: include brief summary then question
      const composed = summary
        ? `Summary of previous conversation (for context):\n${summary}\n\nQuestion: ${tempMessage || ""}`
        : tempMessage || "";

      if (composed) {
        pendingSendRef.current = composed;
        awaitingNewChatRef.current = true;
      }
      // Create destination chat ONCE; effect will send composed into it
      await handleNewChat();
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
    handleSendMessage,
  ]);

  // Debounced draft analyzer: quick local heuristic, optional planner preflight (not blocking)
  const draftAnalyzer = useDebounce((draft: string) => {
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
  }, 1200);

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
  const handleNewChatRef = useRef(handleNewChat);

  // Keep handleNewChatRef in sync
  useEffect(() => {
    handleNewChatRef.current = handleNewChat;
  }, [handleNewChat]);

  // Reset auto-creation flag when authentication changes
  useEffect(() => {
    hasAutoCreatedRef.current = false;
  }, [isAuthenticated]);

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
        handleNewChatRef.current();
      }
    }, 600);
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

  const canShare = currentMessages.length > 0 && !!currentChatId;

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
          privacy: (chat as any).privacy || "private",
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          shareId: (chat as any).shareId,
          publicId: (chat as any).publicId,
          messages: localMessages
            .filter((m) => m.chatId === chat._id)
            .map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              searchResults: m.searchResults,
              sources: m.sources,
              reasoning: m.reasoning,
              searchMethod: m.searchMethod,
              hasRealResults: m.hasRealResults,
            })),
        }));

        if (payload.length === 0) return;

        const mappings = await importLocalChats({ chats: payload });

        // If currently viewing a local chat, switch to the imported server chat
        if (typeof currentChatId === "string") {
          const map = mappings.find((m: any) => m.localId === currentChatId);
          if (map) {
            setCurrentChatId(map.chatId);
          }
        }

        // Clear local data after successful import
        setLocalChats([]);
        setLocalMessages([] as any);
      } catch (e) {
        console.warn("Local chat migration failed; preserving local data", e);
        // Set retry backoff
        try {
          window.localStorage.setItem(
            MIGRATION_RETRY_KEY,
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
      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-full">
        <ChatSidebar
          chats={allChats}
          currentChatId={currentChatId}
          onSelectChat={setCurrentChatId}
          onNewChat={handleNewChat}
          onDeleteLocalChat={(chatId) => {
            // Remove local chat and its messages
            setLocalChats((prev) => prev.filter((c) => c._id !== chatId));
            setLocalMessages((prev) => prev.filter((m) => m.chatId !== chatId));
          }}
          onRequestDeleteChat={(chatId) => {
            if (!looksServerId(String(chatId))) {
              setLocalChats((prev) => prev.filter((c) => c._id !== chatId));
              setLocalMessages((prev) =>
                prev.filter((m) => m.chatId !== chatId),
              );
            } else {
              // Schedule server deletion after undo window
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
          }}
          isOpen={sidebarOpen}
          onToggle={handleToggleSidebar}
        />
      </div>

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={sidebarOpen}
        onClose={() => {
          if (sidebarOpen) handleToggleSidebar();
        }}
        chats={allChats}
        currentChatId={currentChatId}
        onSelectChat={(id) => {
          userSelectedChatAtRef.current = Date.now();
          setCurrentChatId(id);
        }}
        onNewChat={handleNewChat}
        onDeleteLocalChat={(chatId) => {
          setLocalChats((prev) => prev.filter((c) => c._id !== chatId));
          setLocalMessages((prev) => prev.filter((m) => m.chatId !== chatId));
        }}
        onRequestDeleteChat={(chatId) => {
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
          setUndoBanner({ type: "chat", chatId, expiresAt: Date.now() + 5000 });
        }}
      />

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full">
        <div className="flex-1 flex flex-col min-h-0">
          <MessageList
            key={String(currentChatId)}
            messages={currentMessages}
            isGenerating={isGenerating}
            searchProgress={searchProgress}
            onToggleSidebar={() => {
              if (!sidebarOpen) handleToggleSidebar();
            }}
            onShare={canShare ? () => setShowShareModal(true) : undefined}
            currentChat={currentChat}
            onDeleteLocalMessage={(messageId) => {
              // Delete a single local message by id
              setLocalMessages((prev) =>
                prev.filter((m) => m._id !== messageId),
              );
            }}
            onRequestDeleteMessage={(messageId) => {
              if (
                messageId.startsWith("local_") ||
                messageId.startsWith("msg_")
              ) {
                setLocalMessages((prev) =>
                  prev.filter((m) => m._id !== messageId),
                );
              } else {
                setTimeout(async () => {
                  try {
                    await deleteMessage({ messageId: messageId as any });
                  } catch {}
                }, 5000);
              }
              setUndoBanner({
                type: "message",
                messageId,
                expiresAt: Date.now() + 5000,
              });
            }}
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
          {canShare && (
            <div className="px-4 sm:px-6 mb-2 flex justify-end">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    logger.debug("🖱️ New Chat button clicked in MessageList");
                    handleNewChat();
                  }}
                  disabled={isCreatingChat}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
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
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {undoBanner && (
            <div className="px-4 sm:px-6 mb-2 flex justify-center">
              <div className="flex items-center gap-3 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <span>
                  {undoBanner.type === "chat"
                    ? "Chat deleted"
                    : "Message deleted"}
                </span>
                <button
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
          />
        </div>
      </div>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShare={handleShare}
        shareUrl={
          currentChat?.privacy === "public" && currentChat.publicId
            ? `${window.location.origin}/p/${currentChat.publicId}`
            : currentChat?.privacy === "shared" && currentChat.shareId
              ? `${window.location.origin}/s/${currentChat.shareId}`
              : `${window.location.origin}/chat/${currentChat?._id}`
        }
        privacy={currentChat?.privacy || "private"}
      />
    </div>
  );
}
