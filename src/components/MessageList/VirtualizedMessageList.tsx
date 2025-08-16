import React, { useRef, useEffect, useMemo } from "react";
import type { Message } from "../../lib/types/message";

// Helper for stable ephemeral keys for messages without IDs
const ephemeralKeyMap = new WeakMap<Message, string>();

const getEphemeralKey = (msg: Message, index?: number): string => {
  if (!msg) {
    // Fallback for invalid message objects
    return `invalid-${index ?? 0}-${Date.now().toString(36)}`;
  }
  
  let k = ephemeralKeyMap.get(msg);
  if (!k) {
    // Check if message has an id field (streaming messages)
    const msgRecord = msg as Record<string, unknown>;
    const existingId = msg._id || 
      (typeof msgRecord.id === "string" ? msgRecord.id : null);
    
    if (existingId) {
      k = String(existingId);
    } else {
      // Generate a truly unique ephemeral key
      k = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    ephemeralKeyMap.set(msg, k);
  }
  return k;
};

export interface VirtualizedMessageListProps {
  messages: Message[];
  renderItem: (message: Message, index: number) => React.ReactNode;
  className?: string;
  estimatedItemHeight?: number;
  overscan?: number;
}

/**
 * Optimized message list using CSS content-visibility for native virtualization
 * Falls back to standard rendering on unsupported browsers
 */
export function VirtualizedMessageList({
  messages,
  renderItem,
  className,
  estimatedItemHeight = 100,
}: VirtualizedMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Group messages for better performance
  const messageGroups = useMemo(() => {
    const groups: Message[][] = [];
    const groupSize = 10; // Render in chunks of 10

    for (let i = 0; i < messages.length; i += groupSize) {
      groups.push(messages.slice(i, i + groupSize));
    }

    return groups;
  }, [messages]);

  // Optimize scroll performance
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Add passive scroll listener for better performance
    const handleScroll = () => {
      // Browser handles virtualization via content-visibility
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        // Enable CSS-based virtualization
        containIntrinsicSize: `auto ${messages.length * estimatedItemHeight}px`,
      }}
    >
      {messageGroups.map((group, groupIndex) => (
        <div
          key={`group-${groupIndex}`}
          className="message-group"
          style={{
            // Native browser virtualization
            contentVisibility: "auto",
            containIntrinsicSize: `auto ${group.length * estimatedItemHeight}px`,
            contain: "layout style paint",
          }}
        >
          {group.map((message, index) => {
            const actualIndex = groupIndex * 10 + index;
            const messageKey = message._id ?? getEphemeralKey(message, actualIndex);
            const safeKey = messageKey || `fallback-${actualIndex}-${Date.now().toString(36)}`;
            
            if (!messageKey && import.meta.env.DEV) {
              console.error("[KEY] VirtualizedList: Message has no key!", {
                message,
                actualIndex,
                _id: message._id
              });
            }
            
            return (
              <div
                key={safeKey}
                className="message-item"
                data-message-index={actualIndex}
              >
                {renderItem(message, actualIndex)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Hook to detect browser support for content-visibility
 */
export function useSupportsContentVisibility(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return CSS.supports("content-visibility", "auto");
  }, []);
}

/**
 * Performance monitoring for virtualization
 */
export function useVirtualizationMetrics(
  containerRef: React.RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          entry.entryType === "measure" &&
          entry.name.startsWith("virtualization")
        ) {
          // Performance metrics logging disabled in production
          // console.debug(`[Virtualization] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
        }
      }
    });

    observer.observe({ entryTypes: ["measure"] });
    return () => observer.disconnect();
  }, [containerRef]);
}
