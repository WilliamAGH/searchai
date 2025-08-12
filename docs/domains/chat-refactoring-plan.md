# Chat Domain Refactoring Plan

## Executive Summary

This plan addresses critical DRY violations, type safety issues, and performance bottlenecks identified in the chat architecture audit. The refactoring prioritizes type consolidation, validation layer implementation, and performance optimizations while maintaining backward compatibility.

## Phase 1: Type Consolidation (Priority: CRITICAL)

**Goal**: Eliminate duplicate type definitions and establish single source of truth
**Effort**: Medium (2-3 days)
**Risk**: Low (compile-time verification)

### 1.1 Consolidate Chat Types

**Problem**: 5 duplicate Chat interface definitions across components

- `src/components/ChatSidebar.tsx:6-11`
- `src/components/MessageList.tsx:74-82`
- `src/components/MobileSidebar.tsx:8-13`
- `src/components/ChatInterface.tsx:53-78`
- `src/components/ChatInterface.tsx:67-78` (union type)

**Solution**:

```typescript
// src/lib/types/chat.ts (NEW FILE)
import { UnifiedChat } from "./unified";
import { Id } from "../../../convex/_generated/dataModel";

// Base chat type extending UnifiedChat
export interface ChatBase extends UnifiedChat {
  _id: string | Id<"chats">; // Support both local and Convex IDs
}

// Local chat with isLocal flag
export interface LocalChat extends ChatBase {
  isLocal: true;
}

// Server chat (from Convex)
export interface ServerChat extends ChatBase {
  isLocal?: false;
  [key: string]: unknown; // Allow Convex metadata
}

// Union type for components
export type Chat = LocalChat | ServerChat;

// Type guards
export const isLocalChat = (chat: Chat): chat is LocalChat => {
  return "isLocal" in chat && chat.isLocal === true;
};

export const isServerChat = (chat: Chat): chat is ServerChat => {
  return !isLocalChat(chat);
};
```

**Migration Steps**:

1. Create new `src/lib/types/chat.ts` with consolidated types
2. Update all components to import from single source:
   - ChatSidebar: Replace local interface with import
   - MessageList: Replace local interface with import
   - MobileSidebar: Replace local interface with import
   - ChatInterface: Replace LocalChat/Chat with imports
3. Run TypeScript compiler to verify no breaking changes
4. Test all chat operations (create, select, delete)

### 1.2 Consolidate Message Types

**Problem**: LocalMessage type duplicated in ChatInterface
**Solution**: Move to unified types and extend UnifiedMessage

```typescript
// src/lib/types/message.ts (NEW FILE)
import { UnifiedMessage } from "./unified";

export interface LocalMessage extends UnifiedMessage {
  _id: string; // Local ID format
}

export interface ServerMessage extends UnifiedMessage {
  _id: string; // Convex ID format
  _creationTime?: number; // Convex metadata
}

export type Message = LocalMessage | ServerMessage;
```

## Phase 2: Validation Layer (Priority: HIGH)

**Goal**: Add Zod validation for all API boundaries and JSON parsing
**Effort**: Medium (2-3 days)
**Risk**: Medium (runtime behavior changes)

### 2.1 Create Validation Schemas

**Problem**: 6+ locations with unvalidated JSON.parse and API responses

```typescript
// src/lib/schemas/chat.ts (NEW FILE)
import { z } from "zod";

export const ChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  privacy: z.enum(["private", "shared", "public"]),
  shareId: z.string().optional(),
  publicId: z.string().optional(),
  rollingSummary: z.string().optional(),
  source: z.enum(["local", "convex"]),
  synced: z.boolean(),
  lastSyncAt: z.number().optional(),
});

export const MessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.number(),
  searchResults: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        snippet: z.string(),
        relevanceScore: z.number().optional(),
      }),
    )
    .optional(),
  sources: z.array(z.string()).optional(),
  reasoning: z.string().optional(),
  searchMethod: z
    .enum(["serp", "openrouter", "duckduckgo", "fallback"])
    .optional(),
  hasRealResults: z.boolean().optional(),
  isStreaming: z.boolean().optional(),
  thinking: z.string().optional(),
});

// API Response schemas
export const SearchResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string(),
      relevanceScore: z.number(),
    }),
  ),
  searchMethod: z.enum(["serp", "openrouter", "duckduckgo", "fallback"]),
  hasRealResults: z.boolean(),
});

export const AIResponseSchema = z.object({
  response: z.string(),
  reasoning: z.string().optional(),
});
```

### 2.2 Add Validation Wrappers

**Locations to fix**:

- `src/lib/repositories/LocalChatRepository.ts:39,232,370` - localStorage parsing
- `src/lib/services/MigrationService.ts:42,108-109` - migration data parsing
- `src/components/ChatInterface.tsx:404,410` - legacy storage parsing
- `src/lib/repositories/LocalChatRepository.ts:264,298` - API responses

```typescript
// src/lib/utils/validation.ts (NEW FILE)
import { z } from "zod";

export function parseJSON<T>(
  text: string,
  schema: z.ZodSchema<T>,
  fallback?: T,
): T | undefined {
  try {
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  } catch (error) {
    console.error("Validation failed:", error);
    return fallback;
  }
}

export async function validateResponse<T>(
  response: Response,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const data = await response.json();
  return schema.parse(data);
}
```

## Phase 3: Performance Optimizations (Priority: MEDIUM)

**Goal**: Improve loading times and reduce UI jank
**Effort**: Small (1-2 days)
**Risk**: Low

### 3.1 Parallelize Data Loading

**Problem**: Sequential loading in `useUnifiedChat` hook

```typescript
// src/hooks/useUnifiedChat.ts:91-114
// BEFORE: Sequential
const loadChats = async () => {
  const chats = await repository.getChats();
  // Then load messages...
};

// AFTER: Parallel
const loadInitialData = async () => {
  const [chats, messages] = await Promise.all([
    repository.getChats(),
    currentChatId ? repository.getMessages(currentChatId) : Promise.resolve([]),
  ]);
  setState((prev) => ({
    ...prev,
    chats,
    messages: currentChatId ? messages : prev.messages,
    isLoading: false,
  }));
};
```

### 3.2 Batch Message Updates

**Problem**: Individual DB patches in streaming (`convex/messages.ts:67-69`)

```typescript
// convex/messages.ts
export const batchUpdateMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    updates: v.object({
      content: v.optional(v.string()),
      reasoning: v.optional(v.string()),
      isStreaming: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    // Single patch with all updates
    await ctx.db.patch(args.messageId, args.updates);
  },
});
```

### 3.3 Add Suspense Boundaries

**Problem**: Heavy components without loading states

```typescript
// src/App.tsx
import { Suspense, lazy } from 'react';

const ChatInterface = lazy(() => import('./components/ChatInterface'));

function App() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatInterface />
    </Suspense>
  );
}
```

## Phase 4: Hydration & Environment Fixes (Priority: HIGH)

**Goal**: Fix SSR/hydration issues and environment variable handling
**Effort**: Small (1 day)
**Risk**: Medium (affects rendering)

### 4.1 Fix Hydration Issues

**Problems**:

- `Date.now()` in ID generation
- `Math.random()` in generateLocalId
- `window.isSecureContext` checks

```typescript
// src/lib/utils/id.ts (NEW FILE)
import { useId } from "react";

// For React components
export function useStableId(prefix: string): string {
  const reactId = useId();
  return `${prefix}_${reactId}`;
}

// For non-React contexts (with seed)
export function generateStableId(prefix: string, seed: string): string {
  // Use deterministic hash instead of Math.random
  const hash = seed.split("").reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0);
  }, 0);
  return `${prefix}_${hash}_${Date.now()}`;
}
```

### 4.2 Environment Variable Validation

**Problem**: No validation on env vars at startup

```typescript
// src/lib/config/env.ts (NEW FILE)
import { z } from "zod";

const EnvSchema = z.object({
  VITE_CONVEX_URL: z.string().url(),
  // Add other env vars
});

export function validateEnv() {
  try {
    return EnvSchema.parse({
      VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
    });
  } catch (error) {
    console.error("Environment validation failed:", error);
    throw new Error("Invalid environment configuration");
  }
}

// Call in main.tsx
const env = validateEnv();
```

## Phase 5: Bug Fixes (Priority: MEDIUM)

**Goal**: Fix identified bugs
**Effort**: Small (1 day)
**Risk**: Low

### 5.1 Fix Race Condition in Migration

**Problem**: Migration can trigger multiple times (`src/hooks/useUnifiedChat.ts:142-185`)

```typescript
// Add mutex lock
const migrationLock = useRef<Promise<void> | null>(null);

useEffect(() => {
  if (!isAuthenticated || !repository) return;

  const migrate = async () => {
    // Check if migration is already in progress
    if (migrationLock.current) {
      await migrationLock.current;
      return;
    }

    // Create new lock
    migrationLock.current = performMigration();
    await migrationLock.current;
    migrationLock.current = null;
  };

  migrate();
}, [isAuthenticated, repository]);
```

### 5.2 Add Memory Cleanup

**Problem**: Event listeners without cleanup (`src/components/ChatInterface.tsx:127-135`)

```typescript
const fetchJsonWithRetry = useCallback(
  async (url: string, init: RetryInit = {}) => {
    const controller = new AbortController();

    // Cleanup on unmount
    useEffect(() => {
      return () => controller.abort();
    }, []);

    // ... rest of implementation
  },
  [],
);
```

### 5.3 Implement Toast Notification

**Problem**: TODO comment at `src/components/ChatInterface.tsx:786`

```typescript
import { toast } from "sonner";

// Replace alert with toast
toast.error(`Failed to create new chat: ${errorMessage}`);
```

## Phase 6: Additional Improvements (Priority: LOW)

**Goal**: Quality of life improvements
**Effort**: Medium (2-3 days)
**Risk**: Low

### 6.1 Add Health Endpoint

```typescript
// convex/http.ts
http.route({
  path: "/api/health",
  method: "GET",
  handler: async () => {
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: Date.now(),
        version: process.env.BUILD_VERSION || "unknown",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
});
```

### 6.2 Implement Rate Limiting

```typescript
// src/lib/utils/rateLimit.ts
export class RateLimiter {
  private attempts = new Map<string, number[]>();

  constructor(
    private maxAttempts: number,
    private windowMs: number,
  ) {}

  canAttempt(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    const recent = attempts.filter((t) => now - t < this.windowMs);

    if (recent.length >= this.maxAttempts) {
      return false;
    }

    this.attempts.set(key, [...recent, now]);
    return true;
  }
}
```

## Implementation Order & Timeline

### Week 1: Critical Foundation

1. **Day 1-2**: Type Consolidation (Phase 1)
   - Create unified type files
   - Update all components
   - Test thoroughly
2. **Day 3-4**: Validation Layer (Phase 2)

   - Create Zod schemas
   - Add validation wrappers
   - Update all JSON.parse locations

3. **Day 5**: Hydration & Environment Fixes (Phase 4)
   - Fix ID generation
   - Add env validation
   - Test SSR compatibility

### Week 2: Performance & Polish

4. **Day 6**: Performance Optimizations (Phase 3)

   - Parallelize loading
   - Batch updates
   - Add Suspense

5. **Day 7**: Bug Fixes (Phase 5)

   - Fix race conditions
   - Add cleanup
   - Implement toast

6. **Day 8-9**: Additional Improvements (Phase 6)

   - Health endpoint
   - Rate limiting
   - Testing

7. **Day 10**: Testing & Documentation
   - Integration testing
   - Update documentation
   - Performance benchmarks

## Success Metrics

### Code Quality

- ✅ Zero duplicate type definitions
- ✅ 100% of API responses validated
- ✅ All JSON.parse operations use schemas
- ✅ No hydration warnings in console

### Performance

- ⚡ Initial load time < 1s
- ⚡ First message response < 200ms
- ⚡ Smooth scrolling during streaming
- ⚡ No UI jank during updates

### Reliability

- 🛡️ Zero unhandled promise rejections
- 🛡️ Graceful fallbacks for all errors
- 🛡️ No data loss during migration
- 🛡️ Clean console (no warnings)

## Rollback Plan

Each phase is independently deployable with feature flags:

```typescript
// src/lib/features.ts
export const FEATURES = {
  USE_UNIFIED_TYPES: true,
  ENABLE_VALIDATION: true,
  PARALLEL_LOADING: true,
  BATCH_UPDATES: true,
  RATE_LIMITING: false, // Start disabled
};
```

If issues arise:

1. Disable feature flag
2. Deploy hotfix
3. Investigate in staging
4. Re-enable when fixed

## Testing Strategy

### Unit Tests

- Type guard functions
- Validation schemas
- Rate limiter logic
- ID generation

### Integration Tests

- Chat CRUD operations
- Message streaming
- Migration flow
- Share functionality

### E2E Tests

- Full chat session
- Authentication flow
- Share link access
- Mobile interactions

## Documentation Updates

1. Update `docs/domains/chat.md` with new architecture
2. Create migration guide for developers
3. Document new validation patterns
4. Add performance best practices

## Risk Mitigation

### High Risk Areas

1. **Migration Logic**: Test extensively with production-like data
2. **Type Changes**: Use TypeScript strict mode, incremental adoption
3. **Validation**: Start with logging, then enforcement
4. **Performance**: Monitor with profiler, have rollback ready

### Monitoring

- Add performance.mark() for key operations
- Log validation failures to error tracking
- Monitor API response times
- Track hydration warnings

## Next Steps

1. **Review with team** - Get feedback on approach
2. **Create feature branch** - `feat/chat-refactoring`
3. **Set up monitoring** - Before starting changes
4. **Begin Phase 1** - Type consolidation
5. **Daily progress updates** - Track against timeline

## Questions for Second Opinion

1. Should we prioritize performance over type safety?
2. Is the phased approach too conservative?
3. Should we add GraphQL/tRPC for better type safety?
4. Would a complete rewrite be more efficient?
5. Should we migrate to a different state management solution?

---

This plan addresses all critical issues while maintaining system stability. Each phase is independently valuable and can be deployed separately, reducing risk and allowing for continuous improvement.
