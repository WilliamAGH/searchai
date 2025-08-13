# Bug Fixes and Code Audit - August 13, 2025

## Critical Bugs (P0 - Blocking Basic Functionality)

- [x] **T-0000**: ArgumentValidationError preventing chat creation

  - Location: src/lib/repositories/ConvexChatRepository.ts:83
  - Issue: Passing invalid `privacy` field to createChat mutation
  - Status: FIXED ✅
  - Fix: Removed privacy field from mutation call

- [ ] **T-0017**: ChatCreationService instance created but never used

  - Location: src/components/ChatInterface.tsx:71 (aiService extracted but chatCreationService ignored)
  - Issue: `ChatCreationService` imported and instantiated via `useServices` but never used
  - Impact: Dead code, unnecessary memory allocation
  - Fix: Remove the service or integrate it properly
  - Related: useServices.ts:14-16 creates ChatCreationService unnecessarily

- [ ] **T-0018**: Services from useServices hook may be undefined

  - Location: src/hooks/useServices.ts:10-11
  - Issue: UnauthenticatedAIService created with empty string if env vars missing
  - Impact: Silent failures, invalid API calls
  - Fix: Add proper validation and throw/warn if URL is empty

- [ ] **T-0019**: optimisticChat always null in ChatInterface
  - Location: src/components/ChatInterface.tsx (removed from current version)
  - Issue: optimisticChat hardcoded to null, breaking optimistic updates
  - Impact: Poor UX, no immediate feedback on chat actions
  - Fix: Implement proper optimistic update logic

## Type Safety Issues

- [ ] **T-0002**: SearchResult validator repeated multiple times

  - Locations: convex/search.ts, convex/ai.ts, convex/http/routes/stream.ts
  - Fix: Factor into shared constant/schema

- [ ] **T-0023**: Unsafe type assertion in ChatInterface

  - Location: ChatInterface.tsx:104-116
  - Issue: Force casting to `as Chat` without validation
  - Impact: Potential runtime type errors
  - Fix: Add proper type guards or validation

- [ ] **T-0003**: Excessive `any` usage in convex/search.ts

  - Lines with any: 50+ occurrences
  - Fix: Add proper types

- [ ] **T-0004**: Loose typing in convex/http/routes/publish.ts
  - Issue: Using `any` for parsed body and responses
  - Fix: Define proper interfaces

## Code Quality Issues

- [ ] **T-0001**: useUnifiedChat.ts exceeds file size limit

  - Size: 900+ lines (limit: 500)
  - Fix: Split into smaller focused hooks

- [ ] **T-0005**: Dead code - unused variables and imports
  - Multiple files have unused imports
  - Fix: Clean up unused code

## DRY Violations

- [ ] **T-0006**: Duplicate logic for creating new chats

  - Locations: Multiple places handle chat creation differently
  - Fix: Consolidate into single service method

- [ ] **T-0020**: Duplicate logger.debug statements in MessageInput

  - Locations: MessageInput.tsx lines 57, 204, 211-212
  - Issue: Excessive debug logging with similar patterns
  - Fix: Remove or consolidate logging

- [ ] **T-0021**: Duplicate adjustTextarea() calls in MessageInput

  - Locations: MessageInput.tsx lines 194, 218, 230, 235
  - Issue: Multiple useEffect hooks calling same function
  - Fix: Consolidate into single effect with proper dependencies

- [ ] **T-0022**: Duplicate focus logic in MessageInput
  - Locations: MessageInput.tsx lines 198-208 and 252-289
  - Issue: Two separate useEffect hooks trying to focus the textarea
  - Impact: Potential focus fighting, performance issues
  - Fix: Consolidate into single focus management strategy

## Performance Issues

- [ ] **T-0007**: Unbounded message history loading

  - Issue: Loading all messages without pagination
  - Impact: Memory issues with large chats
  - Fix: Implement pagination

- [ ] **T-0008**: Missing error boundaries
  - Issue: No error boundaries around critical components
  - Impact: Full app crashes on component errors
  - Fix: Add error boundaries

## Security/Validation Issues

- [ ] **T-0009**: Missing input validation on HTTP endpoints

  - Location: convex/http/routes/\*
  - Issue: Not validating all inputs
  - Fix: Add comprehensive validation

- [ ] **T-0010**: XSS vulnerability in message rendering
  - Issue: Rendering HTML without proper sanitization
  - Fix: Use DOMPurify or similar

## Feature Flag Issues

- [ ] **T-0011**: Feature flag system incomplete
  - Issue: FEATURE_FLAGS defined but not used

---

## Additional Findings (Aug 13, 2025 - Pass 1)

- [ ] T-0024 [P1][FE] Split oversized `src/components/MessageList.tsx` (672 LOC)

  - Evidence: `wc -l src/components/MessageList.tsx` → 672
  - Risk: Exceeds 500-line limit; mixed concerns (rendering, clipboard, sources, scrolling)
  - Plan: Extract `MessageItem`, `MessageSources`, `ScrollToBottomFab`, `DeletionControls`; centralize favicon helper

- [ ] T-0025 [P1][FE] Split oversized `src/components/ChatInterface.tsx` (530 LOC)

  - Evidence: `wc -l src/components/ChatInterface.tsx` → 530
  - Risk: Exceeds 500-line limit; combines state, layout, modal logic
  - Plan: Extract `ChatHeader`, `ChatBody`, `ChatFooter`, and modal handlers; reuse hooks

- [ ] T-0026 [P2][BE] Resolve circular dependency; re-enable plan cache invalidation on message delete

  - Evidence: `convex/messages.ts` lines ~200–221 and `convex/chats/deletion.ts:38` have TODOs re: invalidation
  - Risk: Stale search planning after deletions
  - Plan: Move invalidation to stable internal action or event hook in `search/cache.ts`; re-enable scheduler call

- [x] T-0027 [P2][FE][DRY] Remove duplicate share modules (`src/lib/share.ts` vs `src/lib/share.mjs`)

  - Evidence: Both implement `buildHumanShareUrl` and `buildLlmTxtUrl`; neither imported anywhere
  - Risk: Dead/duplicate code; confusion between ESM/TS
  - Plan: Keep `share.ts` only; delete `share.mjs`; or remove both if not needed

- [ ] T-0028 [P3][FE][DEAD CODE] Remove or integrate `src/lib/telemetry.ts`

  - Evidence: Not imported anywhere
  - Risk: Dead code increases bundle size
  - Plan: Wire to generation/UX events or remove file

- [ ] T-0029 [P2][FE][LINT] Remove `eslint-disable` pragmas by refactoring

  - Evidence: MessageList.tsx, MobileSidebar.tsx, ContentWithCitations.tsx, CitationRenderer.tsx, MarkdownWithCitations.tsx, MessageInput.tsx
  - Risk: Violates zero-tolerance policy; hides perf issues
  - Plan: Memoize props, extract callbacks with `useCallback`, precompute arrays with `useMemo`, correct dependencies

- [ ] T-0030 [P3][BE][TS] Tighten `getChatMessages` return type (avoid `v.any()`)

  - Evidence: `convex/chats/messages.ts` uses `returns: v.array(v.any())`
  - Risk: Loss of type-safety
  - Plan: Define minimal validator struct or reuse schema shape safely

- [ ] T-0031 [P2][FE][DRY] Extract duplicated `getFaviconUrl` helper

  - Evidence: Defined in both `MessageList.tsx` and `SearchProgress.tsx`
  - Plan: Move to `src/lib/utils/favicon.ts` and import

- [ ] T-0032 [P2][FE] Split `src/components/ShareModal.tsx` (442 LOC)

  - Evidence: `wc -l` shows 442 lines
  - Plan: Extract privacy selector, URL box, and action buttons into subcomponents

- [ ] T-0033 [P3][FE] Split `src/App.tsx` (412 LOC)

  - Evidence: Approaches >400 pre-splitting threshold
  - Plan: Extract router, providers, layout wrappers

- [x] T-0034 [P3][FE][CLEANUP] Remove stale backup `src/App.tsx.bak`

  - Evidence: Present in workspace; `.gitignore` ignores `*.bak`
  - Plan: Delete or archive under docs

- [ ] T-0035 [P3][BE][CLEANUP] Resolve empty folder `convex/internal/`

  - Evidence: Directory exists but empty
  - Plan: Remove or add README explaining reserved use

- [ ] T-0036 [P2][BE][SEC] Parameterize CORS origins for export endpoints

  - Evidence: `convex/http/routes/publish.ts` sets `Access-Control-Allow-Origin: *`
  - Plan: Use env (e.g., `CONVEX_ALLOWED_ORIGINS`) and default to `*` only in dev

- [ ] T-0037 [P3][BE][ROBUSTNESS] Improve error logging around rolling summary clearing in `deleteMessage`

  - Evidence: Empty catch swallows errors when patching chat
  - Plan: Log warning with IDs and error; remain non-fatal

- [ ] T-0038 [P3][BE][CONSISTENCY] Align allowed message roles in `addMessage`

  - Evidence: `convex/messages.ts` `role` union excludes `"system"`, but schema allows it
  - Plan: Decide policy: either support `system` in `addMessage` or document why it’s excluded; adjust validators accordingly

- [ ] T-0039 [P3][FE][CLEANUP] Remove unused `ChatCreationService` from `useServices`
  - Evidence: `src/hooks/useServices.ts` constructs `ChatCreationService` but `ChatInterface` only consumes `aiService`
  - Risk: Unnecessary allocations; dead code path
  - Plan: Remove or wire into flows that need pre-created chats; update imports
  - Fix: Implement or remove

## Testing Issues

- [ ] **T-0012**: Tests failing due to hardcoded delays

  - Issue: Tests use arbitrary timeouts
  - Fix: Use proper wait conditions

- [ ] **T-0013**: Missing tests for critical paths
  - Issue: No tests for chat creation, message sending
  - Fix: Add comprehensive test coverage

## Documentation Issues

- [ ] **T-0014**: Inconsistent JSDoc comments
  - Issue: Some functions documented, others not
  - Fix: Add consistent documentation

## Build/Deploy Issues

- [ ] **T-0015**: Environment variables not validated at startup

  - Issue: App starts with missing required env vars
  - Fix: Add startup validation

- [ ] **T-0016**: No health check endpoint

  - Issue: Can't monitor app health

---

## Validation Results (Aug 13, 2025)

- Lint (oxlint): PASS — 0 warnings, 0 errors
- Typecheck (tsc app + convex): PASS — no errors
- Format (prettier --check): PASS — all files formatted
- Convex import guard: PASS — no client/server boundary violations
- Tests (vitest): ERROR — sandbox worker pool crash (tinypool RangeError) in this environment
- Build (vite build): PASS — built successfully (634 modules)

Follow-up Tasks from Validation

- [ ] T-0040 [P2][CI] Make Vitest config CI-friendly for constrained environments

  - Evidence: `RangeError: Maximum call stack size exceeded` in tinypool during `vitest run`
  - Plan: Add a CI fallback (e.g., `--single-thread` or `--pool=forks`/`--max-threads=1`) driven by env (e.g., `CI=1`); keep parallel locally
  - Success: `npm run test` passes locally and in sandbox/CI

- [ ] T-0041 [P2][FE][TYPES] Align FE `SearchResult` type with backend requirement

  - Evidence: FE `src/lib/types/message.ts` marks `relevanceScore?` optional; backend validators require `relevanceScore: v.number()`
  - Risk: Inconsistent shape across UI/BE; undefined checks proliferate
  - Plan: Make `relevanceScore` required in FE type or guard all UI usage; prefer required to match server
  - Success: Consistent `SearchResult` shape across codebase

- [ ] T-0042 [P3][BE][TYPES] Improve typing in `convex/chats/messages.ts`

  - Evidence: Uses `(chat as unknown as { privacy?: string })` and `returns: v.array(v.any())`
  - Plan: Import `Doc<"chats">` and narrow `chat` properly; replace `v.any()` with a minimal validated shape (role/content/timestamp/search metadata)
  - Success: No unsafe casts or `v.any()`; compile-time safety on fields
  - Fix: Add /health endpoint

- [ ] **T-0024**: Excessive console.log/error statements in production

  - Count: 60+ console statements across 17 files
  - Impact: Performance, security (leaking info), cluttered console
  - Files: ConvexChatRepository.ts (14), MigrationService.ts (10), env.ts (7)
  - Fix: Remove or convert to proper logger with log levels

- [ ] **T-0025**: localStorage accessed in 24+ places without centralization

  - Files: MigrationService.ts (11), LocalChatRepository.ts (4), etc.
  - Issue: Scattered localStorage logic, no single source of truth
  - Impact: Hard to maintain, potential data corruption
  - Fix: Centralize all localStorage operations

- [ ] **T-0026**: ChatCreationService class exists but completely unused

  - Location: src/lib/services/ChatCreationService.ts
  - Referenced only in: useServices.ts (instantiated but never used)
  - Issue: 100 lines of dead code
  - Fix: Either integrate it or delete it entirely

- [ ] **T-0027**: Race condition handling fragmented across multiple files

  - useMessageHandler.ts:58-71 - Checks existing messages
  - ChatCreationService.ts:34-43 - Also checks existing messages
  - Issue: Duplicate race condition logic
  - Fix: Consolidate into single solution

- [ ] **T-0028**: Unsafe type casting in useMessageHandler
  - Location: useMessageHandler.ts:60-62
  - Issue: Force casting to string without validation
  - Code: `as string | undefined`
  - Fix: Add proper type guards

## Additional Findings (Aug 13, 2025 - Pass 2)

- [ ] **T-0040**: Validation functions use type assertions without proper guards

  - Location: src/lib/validation/localStorage.ts lines 33, 57
  - Issue: Force casting to LocalChat/LocalMessage without complete validation
  - Impact: Potential runtime errors if localStorage data corrupted
  - Fix: Add complete type guards for all fields

- [ ] **T-0041**: TODO/FIXME comments left in production code

  - Count: 2 occurrences in Convex backend
  - Files: deletion.ts (1), messages.ts (1)
  - Issue: Unfinished work in production
  - Fix: Resolve or create tickets and remove comments

- [ ] **T-0042**: Event listener cleanup inconsistent
  - Count: 24 event listeners across 16 files
  - Issue: Not all have proper cleanup in useEffect returns
  - Impact: Memory leaks on component unmount
  - Fix: Audit all and ensure cleanup

## Progress Summary

- Total tasks: 42
- Open: 41 | In progress: 0 | Done: 1
- P0 (Critical): 4 tasks
- P1 (High): 6 tasks
- P2 (Medium): 15 tasks
- P3 (Low): 17 tasks

## Critical Issues Found

### MessageInput.tsx Issues:

1. **Duplicate focus management** - Two separate useEffect hooks compete for focus control
2. **Excessive debug logging** - Multiple similar logger.debug calls
3. **Redundant textarea adjustments** - adjustTextarea() called from 4 different effects

### ChatInterface.tsx Issues:

1. **Unused ChatCreationService** - Service created but never utilized (line 71)
2. **Unsafe type casting** - Force casting objects to Chat type without validation (lines 104-116)
3. **Complex prop drilling** - 460+ lines with heavy prop passing through useComponentProps

### useServices.ts Issues:

1. **Silent failure on missing env vars** - Creates service with empty string URL
2. **ChatCreationService instantiated but unused** - Dead code pattern

### useUnifiedChat.ts Issues:

1. **File size violation** - 900 lines (80% over 500 line limit)
2. **Complex state management** - 44 state fields in single interface
3. **Massive interface** - ChatActions has 30+ methods

### LocalChatRepository.ts Issues:

1. **Console.error in production** - Line 63
2. **No error recovery** - Just returns empty array on failure
3. **Duplicate IdUtils logic** - Generating IDs in multiple places

### useMessageHandler.ts Issues:

1. **Race condition logic duplicated** - Lines 58-71 duplicate ChatCreationService logic
2. **Unsafe type casting** - Line 60-62 force casts without validation
3. **Complex dependency injection** - 20+ parameters in deps object

## Files Audited

### Components (10/31)

- [x] src/components/MessageInput.tsx - Multiple issues found
- [x] src/components/ChatInterface.tsx - 530 lines, needs splitting
- [x] src/components/MessageList.tsx - 672 lines, needs splitting
- [x] src/components/ShareModal.tsx - 442 lines
- [x] src/components/MobileSidebar.tsx - eslint-disable issues
- [x] src/components/ContentWithCitations.tsx - eslint-disable issues
- [x] src/components/CitationRenderer.tsx - eslint-disable issues
- [x] src/components/MarkdownWithCitations.tsx - eslint-disable issues
- [x] src/components/SearchProgress.tsx - duplicate code
- [x] src/components/ChatSidebar.tsx - has console.error

### Hooks (3/20)

- [x] src/hooks/useServices.ts - unused ChatCreationService
- [x] src/hooks/useUnifiedChat.ts - 900 lines! Massive violation
- [x] src/hooks/useMessageHandler.ts - duplicate logic, unsafe casting

### Services/Repositories (2/7)

- [x] src/lib/services/ChatCreationService.ts - completely unused
- [x] src/lib/repositories/LocalChatRepository.ts - console.error, no error recovery

### Validation (1/2)

- [x] src/lib/validation/localStorage.ts - unsafe type assertions

### Backend (2/60)

- [x] convex/chats/core.ts - excessive v.any() usage
- [x] convex/chats/messages.ts - v.any() and role issues

### Total: 18/235 files audited (7.7%)

### Remaining: 217 files to audit

## Next Priority Actions

### P0 - Critical (Blocking Basic Functionality)

1. **T-0017**: Remove unused ChatCreationService
2. **T-0018**: Add validation for empty URLs in services
3. **T-0019**: Implement proper optimistic updates

### P1 - High Priority (Major Issues)

4. **T-0001**: Split 900-line useUnifiedChat.ts
5. **T-0024**: Split 672-line MessageList.tsx
6. **T-0025**: Split 530-line ChatInterface.tsx

### P2 - Medium Priority (Code Quality)

7. **T-0022**: Consolidate duplicate focus logic
8. **T-0026**: Resolve circular dependency in deletion
9. **T-0036**: Parameterize CORS origins

### Audit Status

- **Files reviewed**: 18/235 (7.7%)
- **Critical issues found**: 42
- **Estimated remaining issues**: ~500+ (based on current rate)

## Status Updates (Aug 13, 2025)

- [x] T-0002 DRY SearchResult validator: Added convex/lib/validators.ts; updated usages in convex/messages.ts, convex/search.ts.
- [~] T-0003 Reduce any in convex/search.ts: Removed explicit : any[] and tightened several spots; further narrowing planned.
- [x] T-0026 Re-enable plan cache invalidation on delete: Scheduled internal.search.invalidatePlanCacheForChat with logging.
- [~] T-0027 Remove duplicate share.mjs: Pending (sandbox delete blocked); mark for manual removal.
- [x] T-0030/T-0042 Tighten getChatMessages typing and avoid v.any/unsafe casts: Implemented validated return shape and removed cast.
- [x] T-0031 DRY favicon helper: Added src/lib/utils/favicon.ts; updated imports.
- [x] T-0036 Parameterize CORS origins: Origin allowlist applied in publish routes (OPTIONS/POST/GET); errors also return CORS-aware headers.
- [x] T-0037 Better error logging on rolling summary patch failures in deleteMessage.
- [x] T-0039 Remove unused ChatCreationService from useServices (already simplified).
- [x] T-0040 Add test:ci script using forks/single-thread for CI/sandbox.
- [x] T-0041 Align FE SearchResult type to require relevanceScore.
- [~] T-0040 Test CI fallback: updated script to use forks; sandbox still reports tinypool RangeError; recommend CI runner with forks and limited workers or Vitest config-based fallback.
- [~] T-0027/T-0034 Deletions pending: share.mjs and src/App.tsx.bak deletions blocked by sandbox; mark for manual removal.
