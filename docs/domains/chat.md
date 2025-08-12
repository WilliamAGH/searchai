# Chat Architecture

## Core Purpose

The chat domain provides a unified interface for real-time AI-powered search and conversation functionality. It manages chat sessions, message streaming, and search integration for both authenticated (Convex backend) and unauthenticated (localStorage) users, implementing a hybrid storage strategy with automatic migration capabilities.

## Architecture Overview

Data Flow: User Input → Repository Layer → Storage Backend → AI Generation → Search Integration → Stream Response → UI Update
Components:

- **Presentation Layer** (`src/components/ChatInterface.tsx:100-2300`): Main orchestrator, manages state and routing
- **Hook Layer** (`src/hooks/useUnifiedChat.ts:58-546`): Unified interface abstracting storage backends
- **Repository Layer** (`src/lib/repositories/ChatRepository.ts:19-147`): Interface pattern for storage abstraction
- **Storage Backends**: LocalChatRepository (localStorage), ConvexChatRepository (Convex DB)
- **Convex Backend** (`convex/chats.ts:80-350`, `convex/messages.ts:6-200`): Server-side persistence and real-time sync
- **AI Pipeline** (`convex/ai.ts:226-850`): OpenRouter integration with streaming responses
- **Search Layer** (`convex/search.ts:89-850`): Multi-provider search (SERP, OpenRouter, DuckDuckGo)

## Key Features

- **Unified Chat Interface**: Single API for both auth/unauth users via repository pattern
- **Hybrid Storage**: Automatic localStorage → Convex migration on authentication (`src/hooks/useUnifiedChat.ts:142-185`)
- **Real-time Streaming**: Server-sent events for AI responses with chunk batching
- **Multi-provider Search**: Fallback chain SERP → OpenRouter → DuckDuckGo → fallback links
- **Share System**: Unique shareId/publicId generation for chat sharing (`convex/chats.ts:91-92`)
- **Context Compression**: Rolling summary for long conversations (`convex/chats.ts:16-63`)
- **Topic Detection**: Similarity-based new chat suggestions (`src/components/ChatInterface.tsx:39-51`)

## Data Structures

```typescript
// Unified type system - src/lib/types/unified.ts:12-27
export interface UnifiedChat {
  id: string; // Always string (convert Convex IDs)
  title: string;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  privacy: "private" | "shared" | "public";
  shareId?: string;
  publicId?: string;
  rollingSummary?: string;
  source: "local" | "convex";
  synced: boolean;
  lastSyncAt?: number;
  pendingOperations?: Operation[];
}

// Message interface - src/lib/types/unified.ts:33-54
export interface UnifiedMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  searchResults?: SearchResult[];
  sources?: string[];
  reasoning?: string;
  searchMethod?: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults?: boolean;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;
  source: "local" | "convex";
  synced: boolean;
}

// Convex schema - convex/schema.ts:20-35
chats: defineTable({
  title: v.string(),
  userId: v.optional(v.id("users")),
  shareId: v.optional(v.string()),
  publicId: v.optional(v.string()),
  privacy: v.optional(
    v.union(v.literal("private"), v.literal("shared"), v.literal("public")),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  rollingSummary: v.optional(v.string()),
  rollingSummaryUpdatedAt: v.optional(v.number()),
});
```

## Design Decisions

1. **Repository Pattern**: Problem at `src/hooks/useUnifiedChat.ts:63-71` → Solution: Abstract storage backends → Trade-offs: Extra abstraction layer but enables seamless auth transitions
2. **Hybrid Storage**: Problem at `src/lib/services/MigrationService.ts:18-260` → Solution: Progressive enhancement model → Trade-offs: Complex migration logic but preserves user data
3. **Streaming Architecture**: Problem at `convex/ai.ts:73-215` → Solution: SSE with chunked updates → Trade-offs: More complex error handling but better UX
4. **Search Fallback Chain**: Problem at `convex/search.ts:122-200` → Solution: Multiple provider fallbacks → Trade-offs: Higher latency on failures but guaranteed results

## External Integrations

- **Convex v1.25.4**: Real-time database, auth via @convex-dev/auth, websocket sync
- **OpenRouter API**: AI generation endpoint, Bearer auth, streaming SSE responses, rate limits unknown
- **SERP API**: Google/DuckDuckGo search, API key auth, result limits configurable
- **React v19.1.0**: Concurrent features, Suspense boundaries for streaming
- **React Router v7.8.0**: Client-side routing for chat navigation

## Performance & Security

- Response times: Search 500-2000ms, AI generation 100-300ms first token
- Cache TTLs: Plan cache 3min (`convex/search.ts:71`), search results ephemeral
- Memory limits: Rolling summary 1600 chars (`convex/chats.ts:25`)
- Auth: Convex Auth with JWT, localStorage for unauth users
- Validation: Missing Zod validation on API boundaries, using runtime type guards
- XSS: rehype-sanitize on markdown content (`package.json:44`)

## Operations & Testing

- Health: No dedicated health endpoints
- Tests: `tests/convex.search.spec.mjs`, `tests/e2e/*.spec.ts` with Playwright
- Ops: `npm run validate`, `npm run test:smoke`, `npm run dev`

## 🐛 Bugs & Improvements Inventory

### Type/Validation Issues (PRIORITY)

1. **Duplicate Chat Types** - Multiple Chat interfaces defined: `src/components/ChatSidebar.tsx:6-11`, `src/components/MessageList.tsx:74-82`, `src/components/MobileSidebar.tsx:8-13`, `src/components/ChatInterface.tsx:53-78` - should extend UnifiedChat
2. **Missing Validation** - `src/lib/repositories/LocalChatRepository.ts:232` - JSON.parse without validation on streaming response
3. **Missing Validation** - `src/lib/services/MigrationService.ts:42,108-109` - JSON.parse on localStorage without schema validation
4. **Type Assertions** - `src/components/ShareModal.tsx:117` - unsafe type assertion `as unknown as`
5. **Missing Validation** - `src/components/ChatInterface.tsx:404,410` - JSON.parse on legacy storage without validation
6. **Missing API Response Validation** - `src/lib/repositories/LocalChatRepository.ts:264,298` - `.json()` without schema validation

### Environment Issues (CRITICAL)

1. **Missing Error Handling** - `src/main.tsx:9` - VITE_CONVEX_URL used without validation or fallback
2. **Runtime Config Access** - `convex/ai.ts:83-99` - Multiple process.env accesses should be validated at startup

### Hydration Issues

1. **Date/Time** - `src/lib/types/unified.ts:143` - Date.now() in ID generation could cause hydration mismatch
2. **Browser APIs** - `src/lib/clipboard.ts:12` - window.isSecureContext check needs useEffect wrapper
3. **Random Values** - `src/lib/types/unified.ts:143` - Math.random() in generateLocalId needs stable alternative

### Performance Issues

1. **Sequential Loading** - `src/hooks/useUnifiedChat.ts:91-114` - loadChats then loadMessages could be parallelized
2. **Missing Suspense** - `src/components/ChatInterface.tsx:100` - Heavy component without Suspense boundary
3. **Unbatched Updates** - `convex/messages.ts:67-69` - Individual DB patches instead of batch updates

### Bugs

1. **Race Condition** - `src/hooks/useUnifiedChat.ts:142-185` - Migration can trigger multiple times if auth changes rapidly
2. **Memory Leak** - `src/components/ChatInterface.tsx:127-135` - Event listeners without cleanup in fetchJsonWithRetry
3. **TODO Comment** - `src/components/ChatInterface.tsx:786` - Missing toast notification implementation

### Improvements

1. **Extract Common Types** - Create base Chat type in unified.ts and extend everywhere, effort: S
2. **Add Zod Validation** - Validate all JSON.parse and API responses with schemas, effort: M
3. **Batch DB Operations** - Combine message updates in streaming, effort: M
4. **Add Health Endpoint** - Create /api/health for monitoring, effort: S
5. **Implement Rate Limiting** - Add client-side rate limiting for API calls, effort: M

### British English

- No British spellings found in code (external API fields like "colour" are correctly preserved as-is)

## Related Documentation

- `chat.mmd` - Visual flow diagram
- `unified.md` - Unified type system details
- `migration.md` - Data migration strategies
