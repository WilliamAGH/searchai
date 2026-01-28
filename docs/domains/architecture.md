# Architecture

## High level

- **Frontend**: React + Vite (`src/`)
- **Backend**: Convex (`convex/`)
- **Unauthenticated API**: Convex HTTP routes (`convex/http.ts` is the router entry point)
- **Authenticated chat**: Convex queries/mutations/actions + SSE streaming

## Chat data flow

The app supports both local-only and Convex-backed chat storage (selected via the repository layer). See the chat domain diagram:

- `chat.mmd`

## Agent workflow

The streaming agent workflow is implemented in `convex/agents/orchestration.ts` and emits SSE frames consumed by the frontend via `src/lib/utils/sseParser.ts` and `src/lib/repositories/ConvexChatRepository.ts`.

Key ideas:

- A shared conversation summary is generated server-side and used for planning/search relevance.
- Search queries are augmented deterministically with high-signal context keywords plus an “anchor” query based on the latest user message.

## UI notes

- Topic-change suggestions are implemented as an inline banner and must not block sending messages. The tuning constants live near the top of `src/components/ChatInterface/index.tsx`.

## Pagination

### Goals

- Reduce initial load and bound DOM nodes
- Initial load fetches most recent N (default 50) messages; subsequent loads fetch older pages using server-provided cursor

### Server Layer

- `getRecentChatMessages(chatId, limit)` returns latest messages and a cursor
- `loadMoreMessages(chatId, cursor, limit)` returns the next page and next cursor
- Validate with `v` validators in Convex

### Client Layer

- Repository exposes `getMessagesPaginated(chatId, opts)` and returns `{ messages, cursor, hasMore }`
- `usePaginatedMessages(chatId)` manages state, cursor, `loadMore`, errors, retries
- `MessageList` shows 3–5 skeletons on initial load and a small skeleton while loading more

### Error Handling

- Exponential backoff (1s, 2s, 4s) up to 3 attempts
- Detect offline; queue retry when back online
- Session guard discards obsolete results if chat changes mid-retry

### Parameters

- Initial/subsequent page size: 50
- Target: ≤200 DOM nodes steady state (recent pages + buffer)
