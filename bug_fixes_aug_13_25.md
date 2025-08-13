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
  - Fix: Add /health endpoint

## Progress Summary

- Total tasks: 24
- Open: 23 | In progress: 0 | Done: 1

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

## Files Audited

- [x] src/components/MessageInput.tsx
- [x] src/hooks/useServices.ts
- [x] src/components/ChatInterface.tsx
- [ ] ... 232 more files to audit

## Next Priority Actions

1. Fix T-0017: Remove unused ChatCreationService
2. Fix T-0018: Add validation for empty URLs in services
3. Fix T-0022: Consolidate duplicate focus logic in MessageInput
4. Continue auditing remaining critical files
