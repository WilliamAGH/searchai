# Pagination Guide

This guide explains the pagination architecture used for loading chat messages, why we chose cursor-based pagination, and how to use it safely in the UI.

## Overview

- Backend: `convex/chats/messagesPaginated.ts` implements cursor-based pagination queries/actions with invalid-cursor recovery.
- Repository: `src/lib/repositories/ConvexChatRepository.ts` exposes `getMessagesPaginated()`.
- Hook: `src/hooks/usePaginatedMessages.ts` provides React state with retry, error, and stale-session guards.
- UI: `src/components/MessageList/` shows initial skeletons and integrates load-more behavior.

Why cursor-based?

- Stable ordering while new messages arrive.
- Efficient continuation via opaque cursors.
- Better performance than offset for large collections.

## Usage

```tsx
import { usePaginatedMessages } from "../../hooks/usePaginatedMessages";

const {
  messages,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  retryCount,
  loadMore,
  refresh,
  clearError,
} = usePaginatedMessages({
  chatId,
  initialLimit: 50,
  enabled: Boolean(chatId),
});
```

UI patterns:

- Show skeletons during initial load.
- Disable load-more while `isLoadingMore`.
- Expose error UI with retry (call `clearError()` then `loadMore()`).

## Error Handling & Retries

- Exponential backoff: 1s, 2s, 4s, capped at 5s.
- Errors surface via `error` and `retryCount`.
- Retry timer is cleaned up on unmount and when `chatId` changes.

## Race Condition & Stale Result Guards

- `usePaginatedMessages` uses a session guard to discard results from obsolete sessions (e.g., when the user navigates to another chat mid-retry).
- Concurrent `loadMore` calls are serialized via an internal `loadingRef`.

## Edge Cases

- Deleted messages after cursor creation: server still returns a valid page relative to the cursor, or `hasMore=false` when exhausted.
- Invalid/expired cursors: the backend now gracefully recovers by ignoring the stale cursor and returning the most recent page (newest messages). The hook resumes from the returned `nextCursor`.
- Component unmount during retry: retry timers are always cleared on unmount.

## Performance Tips

- Keep `initialLimit` moderate (50–100) for fast first paint.
- Consider virtualization for very large threads.
- Memoize message items to reduce re-renders.

## Migration

- Replace direct full-history loaders with the repository’s paginated API.
- For summarization/export, prefer recent messages (e.g., last 50–100) unless full export is explicitly requested.
