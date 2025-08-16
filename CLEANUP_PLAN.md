# Local Storage Cleanup Plan

## Current State

The app is already 100% Convex-based. LocalChatRepository exists but is never instantiated or used.
Anonymous users get a sessionId and use Convex directly.

## Dead Code to Remove

### 1. Remove LocalChatRepository and related files

- [ ] `/src/lib/repositories/LocalChatRepository.ts` - Entire file (502 lines)
- [ ] `/src/lib/validation/localStorage.ts` - Legacy validation logic
- [ ] `/src/lib/services/UnauthenticatedAIService.ts` - Check if still needed
- [ ] `/src/lib/services/MigrationService.ts` - No longer needed

### 2. Remove `isLocal` from type definitions

- [ ] Remove `isLocal?: boolean` from Chat types in `/src/lib/types/chat.ts`
- [ ] Remove `isLocal` checks from UI components:
  - `/src/components/ChatSidebar.tsx` (line 219)
  - `/src/components/MobileSidebar.tsx` (line 266)
  - `/src/components/ChatInterface/index.tsx` (lines 198, 202, 210, 219)

### 3. Clean up migration/sync code

- [ ] Remove `/src/hooks/useChatMigration.ts`
- [ ] Remove `/src/hooks/useClaimAnonymousChats.ts`
- [ ] Remove migration logic from `useUnifiedChat.ts`

### 4. Simplify chat deletion

- [ ] Remove `handleDeleteLocalChat` from `useDeletionHandlers.ts`
- [ ] Remove `onDeleteLocalChat` props from components
- [ ] Use only `handleRequestDeleteChat` for all deletions

### 5. Update localStorage usage

- [ ] Keep theme preferences in localStorage (legitimate use)
- [ ] Keep anonymous sessionId in localStorage (needed for Convex)
- [ ] Remove chat/message storage keys

## Benefits After Cleanup

1. **Simpler codebase** - Remove ~1000+ lines of dead code
2. **Single source of truth** - Only Convex, no sync issues
3. **Clearer mental model** - No confusion about local vs. synced
4. **Better performance** - No unnecessary localStorage operations
5. **Easier maintenance** - One storage system to maintain

## Implementation Order

1. First: Remove UI references to `isLocal`
2. Second: Remove LocalChatRepository and related services
3. Third: Simplify deletion handlers
4. Fourth: Remove migration hooks
5. Finally: Update types to remove `isLocal` fields

## Testing Plan

1. Verify anonymous users can still create/use chats
2. Verify authenticated users see all their chats
3. Verify chat deletion works for all users
4. Verify no console errors about missing localStorage
5. Run full test suite
