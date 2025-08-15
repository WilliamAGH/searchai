# Loading State & Duplicate Code Consolidation Task List

## Overview

This document outlines surgical fixes to consolidate duplicate loading indicators while preserving existing functionality. Each task is designed to be minimal, stable, and uses existing code patterns.

## Phase 1: Create Shared Loading Components (Non-Breaking)

### [x] 1. Create Unified Spinner Component

- [x] Create `src/components/ui/Spinner.tsx` that wraps the existing SVG spinner pattern
- [x] Accept props: `size: 'sm' | 'md' | 'lg'`, `className?: string`
- [x] Use the existing spinner SVG from `LoadingBoundary.tsx` as the template
- [x] Keep all existing `animate-spin` classes working

### [x] 2. Create Unified Loading Text Component

- [x] Create `src/components/ui/LoadingText.tsx` for consistent text displays
- [x] Accept props: `message: string`, `showDots?: boolean`
- [x] Reuse the three-dot animation from `SearchProgress.tsx:164-166`
- [x] Default messages: "Loading...", "Generating...", "Processing..."

### [x] 3. Extract Three-Dots Animation

- [x] Create `src/components/ui/ThreeDots.tsx` component
- [x] Move the bouncing dots pattern from `SearchProgress.tsx:164-166`
- [x] Accept props: `size?: 'sm' | 'md'`, `color?: string`

## Phase 2: Replace Duplicate Spinners (Low Risk)

### [x] 4. Replace Spinners in Non-Critical Components

- [x] Replace spinner in `src/components/ShareModal.tsx:459`
- [x] Replace spinner in `src/components/LoadMoreButton.tsx:43`
- [x] Keep original functionality intact, just swap SVG for `<Spinner size="sm" />`

### [x] 5. Replace Spinners in Sidebar Components

- [x] Replace spinner in `src/components/ChatSidebar.tsx:171`
- [x] Replace spinner in `src/components/MobileSidebar.tsx:211`
- [x] Maintain existing "Creating..." text alongside spinner

### [x] 6. Update LoadingBoundary Spinners

- [x] Replace both spinners in `LoadingBoundary.tsx` with unified component
- [x] Keep existing Suspense boundary logic unchanged
- [x] Maintain existing `DefaultLoadingFallback` structure

## Phase 3: Consolidate Loading Messages (Safe Changes)

### [ ] 7. Standardize "Loading" Messages

- [ ] Update `LoadingBoundary.tsx:18` to use `<LoadingText message="Loading..." />`
- [ ] Update `LoadMoreButton.tsx:44` to use consistent text
- [ ] Keep component structure unchanged

### [ ] 8. Standardize "Creating" States

- [ ] Update `ChatSidebar.tsx:206` to use `<LoadingText message="Creating..." />`
- [ ] Update `MobileSidebar.tsx:247` to match
- [ ] Preserve button disable states and click handlers

### [x] 9. Consolidate Three-Dot Animations

- [x] Replace dots in `SearchProgress.tsx:164-166` with `<ThreeDots />`
- [x] Replace dots in `MessageList/index.tsx:469-471` with `<ThreeDots />`
- [x] Keep surrounding elements and structure intact

## Phase 4: Merge Skeleton Components (Careful Refactor)

### [x] 10. Identify Skeleton Component to Keep

- [x] Audit `MessageSkeleton`, `MessageLoadingSkeleton`, `SkeletonLoader`
- [x] Choose `MessageSkeleton` as primary (most complete implementation)
- [x] Document differences for migration

### [x] 11. Add Skeleton Variants

- [x] Add `variant: 'message' | 'simple' | 'lines'` prop to `MessageSkeleton`
- [x] Implement each variant to match existing skeleton behaviors
- [x] Keep backward compatibility with default variant

### [x] 12. Replace Duplicate Skeletons

- [x] Replace `MessageLoadingSkeleton` usage with `<MessageSkeleton variant="simple" />`
- [x] Replace `SkeletonLoader` usage with `<MessageSkeleton variant="lines" />`
- [x] Test each replacement individually

## Phase 5: Unify Animation Classes (CSS Optimization)

### [ ] 13. Create Animation Utility Classes

- [ ] Add to `src/styles/animations.css`:
  - `.loading-spin` (wraps animate-spin)
  - `.loading-pulse` (wraps animate-pulse)
  - `.loading-bounce` (wraps animate-bounce)
- [ ] Import in `src/index.css`

### [ ] 14. Update Animation References

- [ ] Find/replace `animate-spin` with `loading-spin` (14 locations)
- [ ] Find/replace `animate-pulse` with `loading-pulse` (6 locations)
- [ ] Find/replace `animate-bounce` with `loading-bounce` (6 locations)
- [ ] Verify animations still work correctly

## Phase 6: Streaming State Consolidation (Complex but Isolated)

### [x] 15. Document Streaming State Pattern

- [x] Create `docs/STREAMING_STATE.md` documenting current pattern
- [x] List all components using `isStreaming`, `streamingContent`, `thinking`
- [x] Define canonical streaming state structure

### [x] 16. Create Streaming Indicator Component

- [x] Create `src/components/ui/StreamingIndicator.tsx`
- [x] Accept props: `isStreaming`, `thinking?`, `message?`
- [x] Use existing "AI is thinking" UI from `MessageList/index.tsx:467`

### [x] 17. Replace Inline Streaming Indicators

- [x] Replace custom streaming UI in `MessageList/index.tsx:434-476`
- [x] Replace with `<StreamingIndicator />` component
- [x] Keep all streaming logic in parent components

## Phase 7: SearchProgress Simplification (Isolated Component)

### [ ] 18. Extract SearchProgress Icons

- [ ] Move stage icons to separate functions in SearchProgress
- [ ] Create `getStageIcon(stage)` that returns existing icons
- [ ] No visual changes, just code organization

### [ ] 19. Use Shared Components in SearchProgress

- [ ] Replace custom dots with `<ThreeDots />`
- [ ] Replace custom spinner with `<Spinner />`
- [ ] Keep multi-stage logic intact

## Phase 8: Error State Standardization (Safety First)

### [ ] 20. Audit Error States

- [ ] List all components with error/retry UI
- [ ] Document current error handling patterns
- [ ] Identify `LoadErrorState` as the standard

### [ ] 21. Create Error State Props Interface

- [ ] Define `ErrorStateProps` interface
- [ ] Include: `error`, `onRetry`, `retryCount?`, `message?`
- [ ] Keep compatible with existing `LoadErrorState`

## Phase 9: Accessibility Standardization (Important)

### [ ] 22. Create Accessibility Constants

- [ ] Define standard aria labels in `src/lib/constants/accessibility.ts`
- [ ] Include: loading states, error states, progress indicators
- [ ] Export for reuse across components

### [ ] 23. Update Loading Components with ARIA

- [ ] Add `role="status"` to all loading indicators
- [ ] Add `aria-live="polite"` for dynamic updates
- [ ] Add `aria-label` with descriptive text
- [ ] Test with screen reader

## Phase 10: Testing & Documentation

### [ ] 24. Create Loading Component Tests

- [ ] Test unified Spinner component
- [ ] Test LoadingText component
- [ ] Test ThreeDots component
- [ ] Ensure backward compatibility

### [ ] 25. Update Component Documentation

- [ ] Document new shared components in Storybook/docs
- [ ] Add usage examples for each variant
- [ ] Include migration guide from old patterns

### [ ] 26. Performance Testing

- [ ] Measure bundle size before/after changes
- [ ] Test animation performance with Chrome DevTools
- [ ] Ensure no additional re-renders introduced

## Phase 11: Final Cleanup (Optional, Lower Priority)

### [ ] 27. Remove Fully Deprecated Code

- [ ] Remove unused skeleton components after migration
- [ ] Remove duplicate SVG definitions
- [ ] Clean up unused CSS classes

### [ ] 28. Create Loading State Guidelines

- [ ] Document when to use which loading pattern
- [ ] Create decision tree for developers
- [ ] Add to project documentation

## Success Metrics

- [ ] Bundle size reduced by at least 5KB
- [ ] No visual regressions in any loading states
- [ ] All existing tests still pass
- [ ] Loading components have 100% test coverage
- [ ] Accessibility audit passes for all loading states

## Notes

- Each task should be completed and tested independently
- Preserve ALL existing functionality - no breaking changes
- Use existing patterns and code wherever possible
- Test thoroughly after each phase
- Keep commits small and focused on single tasks
