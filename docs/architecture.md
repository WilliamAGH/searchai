# Architecture

## High level

- **Frontend**: React + Vite (`src/`)
- **Backend**: Convex (`convex/`)
- **Unauthenticated API**: Convex HTTP routes (`convex/http.ts` and `convex/http/routes/*`)
- **Authenticated chat**: Convex queries/mutations/actions + SSE streaming

## Chat data flow

The app supports both local-only and Convex-backed chat storage (selected via the repository layer). See the chat domain diagram:

- `docs/domains/chat.mmd`

## Agent workflow

The streaming agent workflow is implemented in `convex/agents/orchestration.ts` and emits SSE frames consumed by the frontend via `src/lib/utils/sseParser.ts` and `src/lib/repositories/ConvexChatRepository.ts`.

Key ideas:

- A shared conversation summary is generated server-side and used for planning/search relevance.
- Search queries are augmented deterministically with high-signal context keywords plus an “anchor” query based on the latest user message.

## UI notes

- Topic-change suggestions are implemented as an inline banner and must not block sending messages. The tuning constants live near the top of `src/components/ChatInterface.tsx`.
