/**
 * Custom hook for MessageList scroll behavior
 * Encapsulates auto-scroll, FAB visibility, and scroll position preservation
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useIsVirtualKeyboardOpen } from "@/hooks/useIsVirtualKeyboardOpen";
import { throttle, isNearBottom, isScrolledPastPercent } from "@/lib/utils";
import type { SearchProgress } from "@/lib/types/message";

/** Duration of smooth scroll animation (ms) */
const SCROLL_ANIMATION_MS = 600;
/** Throttle scroll event handler to this interval (ms) */
const THROTTLE_MS = 100;
/** Percentage threshold: hide FAB when user is 95%+ of the way down */
const SCROLL_PERCENT_THRESHOLD = 95;

interface UseMessageListScrollOptions {
  /** Current message count for tracking unseen messages */
  messageCount: number;
  /** Whether the AI is currently generating a response */
  isGenerating: boolean;
  /** External scroll container ref (when parent handles scrolling) */
  externalScrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Search progress to trigger scroll on tool updates */
  searchProgress?: SearchProgress;
}

interface UseMessageListScrollResult {
  /** Ref for the scroll container (internal or external) */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref for the end-of-messages marker element */
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  /** Internal scroll ref (for fallback mode) */
  internalScrollRef: React.RefObject<HTMLDivElement | null>;
  /** Whether using external scroll container */
  useExternalScroll: boolean;
  /** Whether user has scrolled away from bottom */
  userHasScrolled: boolean;
  /** Count of messages arrived while scrolled up */
  unseenMessageCount: number;
  /** Handler for "scroll to bottom" FAB click */
  handleScrollToBottom: () => void;
  /** Handler for loading more messages with scroll preservation */
  handleLoadMore: (onLoadMore: () => Promise<void>) => Promise<void>;
}

/**
 * Hook that manages all scroll-related behavior for the message list:
 * - Auto-scroll when near bottom or generating
 * - FAB visibility based on scroll position
 * - Unseen message counting
 * - Scroll position preservation during pagination
 * - Touch/wheel interruption of smooth scroll
 */
export function useMessageListScroll({
  messageCount,
  isGenerating,
  externalScrollRef,
  searchProgress,
}: UseMessageListScrollOptions): UseMessageListScrollResult {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = externalScrollRef || internalScrollRef;
  const useExternalScroll = !!externalScrollRef;

  // Refs for scroll state management
  const previousMessagesLengthRef = useRef(messageCount);
  const isLoadingMoreRef = useRef(false);
  const lastSeenMessageCountRef = useRef(messageCount);
  const autoScrollEnabledRef = useRef(true);
  const smoothScrollInProgressRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = useIsMobile();
  const isVirtualKeyboardOpen = useIsVirtualKeyboardOpen();

  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [unseenMessageCount, setUnseenMessageCount] = useState(0);

  // Dynamic thresholds based on viewport
  const NEAR_BOTTOM_THRESHOLD = isMobile ? 100 : 200;
  const STUCK_THRESHOLD = isMobile ? 50 : 100;

  /**
   * Cancel any ongoing smooth scroll
   */
  const cancelSmoothScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    if (container && smoothScrollInProgressRef.current) {
      const currentPos = container.scrollTop;
      container.scrollTo({ top: currentPos, behavior: "auto" });
      smoothScrollInProgressRef.current = false;
    }
  }, [scrollContainerRef]);

  /**
   * Scroll to bottom of messages
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (behavior === "smooth") {
        smoothScrollInProgressRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        // Reset flag after animation completes and ensure FAB is hidden
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          smoothScrollInProgressRef.current = false;
          // After scroll animation, verify we're near bottom and keep FAB hidden
          const stillNearBottom =
            isNearBottom(container, STUCK_THRESHOLD) ||
            isScrolledPastPercent(container, SCROLL_PERCENT_THRESHOLD);
          if (stillNearBottom) {
            setUserHasScrolled(false);
          }
        }, SCROLL_ANIMATION_MS);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }
    },
    [scrollContainerRef, STUCK_THRESHOLD],
  );

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, []);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom("smooth");
    setUserHasScrolled(false);
    setUnseenMessageCount(0);
    autoScrollEnabledRef.current = true;
    lastSeenMessageCountRef.current = messageCount;
  }, [scrollToBottom, messageCount]);

  /**
   * Handle load more with scroll position preservation
   */
  const handleLoadMore = useCallback(
    async (onLoadMore: () => Promise<void>) => {
      if (isLoadingMoreRef.current) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      // Save scroll height before loading
      const prevScrollHeight = container.scrollHeight;
      const prevScrollTop = container.scrollTop;

      isLoadingMoreRef.current = true;

      try {
        await onLoadMore();

        // After messages are loaded, restore scroll position
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeight;
            container.scrollTop = prevScrollTop + scrollDiff;
          }
        });
      } finally {
        isLoadingMoreRef.current = false;
      }
    },
    [scrollContainerRef],
  );

  // Intelligent auto-scroll: scroll when near bottom or actively generating
  // Also triggers on searchProgress changes to keep tool status visible
  // IMPORTANT: Pauses when virtual keyboard is open to prevent viewport theft
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const shouldAutoScroll =
      autoScrollEnabledRef.current &&
      !isVirtualKeyboardOpen &&
      (isNearBottom(container, NEAR_BOTTOM_THRESHOLD) ||
        (isGenerating && !userHasScrolled));

    if (shouldAutoScroll) {
      scrollToBottom("smooth");
      lastSeenMessageCountRef.current = messageCount;
    }
  }, [
    messageCount,
    isGenerating,
    userHasScrolled,
    isVirtualKeyboardOpen,
    scrollToBottom,
    NEAR_BOTTOM_THRESHOLD,
    scrollContainerRef,
    searchProgress,
  ]);

  // Track unseen messages when user is scrolled up
  useEffect(() => {
    if (userHasScrolled) {
      const newMessages = messageCount - lastSeenMessageCountRef.current;
      if (newMessages > 0) {
        setUnseenMessageCount(newMessages);
      }
    }
  }, [messageCount, userHasScrolled]);

  // Reset auto-scroll when new assistant message starts streaming
  // Note: This relies on messageCount changes; for more precise control,
  // the component should pass lastMessage info
  useEffect(() => {
    if (isGenerating) {
      const container = scrollContainerRef.current;
      if (container && isNearBottom(container, NEAR_BOTTOM_THRESHOLD * 2)) {
        autoScrollEnabledRef.current = true;
        setUserHasScrolled(false);
      }
    }
  }, [isGenerating, NEAR_BOTTOM_THRESHOLD, scrollContainerRef]);

  // Detect when user scrolls manually with touch/scroll awareness
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      cancelSmoothScroll();
    };

    const handleWheel = () => {
      cancelSmoothScroll();
    };

    const handleScroll = throttle(() => {
      // If smooth scroll is in progress, don't update state
      if (smoothScrollInProgressRef.current) return;

      // Use both pixel threshold AND percentage-based check for reliability
      const nearBottomPixels = isNearBottom(container, STUCK_THRESHOLD);
      const nearBottomPercent = isScrolledPastPercent(
        container,
        SCROLL_PERCENT_THRESHOLD,
      );
      const nearBottom = nearBottomPixels || nearBottomPercent;
      const wasScrolledUp = userHasScrolled;

      // User is near bottom - enable auto-scroll
      if (nearBottom) {
        if (wasScrolledUp) {
          setUserHasScrolled(false);
          setUnseenMessageCount(0);
          lastSeenMessageCountRef.current = messageCount;
        }
        autoScrollEnabledRef.current = true;
      }
      // User scrolled up - disable auto-scroll
      else {
        if (!wasScrolledUp) {
          setUserHasScrolled(true);
          lastSeenMessageCountRef.current = messageCount;
        }
        autoScrollEnabledRef.current = false;
      }
    }, THROTTLE_MS);

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [
    userHasScrolled,
    messageCount,
    STUCK_THRESHOLD,
    cancelSmoothScroll,
    scrollContainerRef,
  ]);

  // Track when messages change to preserve scroll on load more
  useEffect(() => {
    previousMessagesLengthRef.current = messageCount;
  }, [messageCount]);

  return {
    scrollContainerRef,
    messagesEndRef,
    internalScrollRef,
    useExternalScroll,
    userHasScrolled,
    unseenMessageCount,
    handleScrollToBottom,
    handleLoadMore,
  };
}
