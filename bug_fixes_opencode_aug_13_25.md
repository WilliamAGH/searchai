# Bug Fixes and DRY Audit (Opencode) – August 13, 2025

**Purpose**: Comprehensive audit of the repository for bugs, neglected code, and DRY (repeating) code violations. Each identified issue is recorded as a separate task with a unique identifier. Tasks are tracked in this checklist and updated continuously as the audit progresses.

---

## Checklist

| ID      | File / Area                                    | Issue Type | Description                                                                                                          | Status |
| ------- | ---------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-001 | `src/components/ChatControls.tsx`              | Review     | Verify proper handling of click events, ensure no memory leaks, and check for duplicated logic with `ChatInterface`. | ☐      |
| BUG-002 | `src/components/ChatInterface.tsx`             | Review     | Large component (>500 lines) – consider splitting; look for duplicated state handling with `useMessageHandler`.      | ☐      |
| BUG-003 | `src/components/MessageInput.tsx`              | Review     | Ensure input sanitization, debounce implementation, and DRY with `useDebounce`.                                      | ☐      |
| BUG-004 | `src/hooks/useDebounce.ts`                     | Review     | Confirm generic typing, avoid any, and check for similar debounce logic elsewhere (`src/lib/utils/httpUtils.ts`).    | ☐      |
| BUG-005 | `src/lib/utils/chatValidation.ts`              | Review     | Validate schema against Convex validators; look for duplicated validation in `src/lib/validation/apiResponses.ts`.   | ☐      |
| BUG-006 | `src/lib/utils/httpUtils.ts`                   | Review     | Ensure proper error handling, avoid duplicated fetch wrappers.                                                       | ☐      |
| BUG-007 | `src/lib/utils/id.ts`                          | Review     | Verify ID generation consistency; duplicate with `src/lib/utils/messageMapper.ts`?                                   | ☐      |
| BUG-008 | `src/lib/utils/messageMapper.ts`               | Review     | Mapping logic may duplicate in `src/lib/utils/chatHistory.ts`.                                                       | ☐      |
| BUG-009 | `src/lib/utils/chatHistory.ts`                 | Review     | Check for overlapping responsibilities with `messageMapper`.                                                         | ☐      |
| BUG-010 | `src/lib/validation/apiResponses.ts`           | Review     | Ensure response validation aligns with Convex `v` validators; duplicate checks with `chatValidation`.                | ☐      |
| BUG-011 | `src/lib/validation/localStorage.ts`           | Review     | Verify type safety, avoid any, and check for duplicated storage helpers.                                             | ☐      |
| BUG-012 | `src/hooks/useMessageHandler.ts`               | Review     | Large hook – split responsibilities; duplicate logic with `useChatNavigation`.                                       | ☐      |
| BUG-013 | `src/hooks/useChatNavigation.ts`               | Review     | Ensure navigation state is correctly typed; DRY with `useUrlStateSync`.                                              | ☐      |
| BUG-014 | `src/hooks/useUrlStateSync.ts`                 | Review     | Verify URL sync does not cause infinite loops; duplicate with `useSidebarTiming`.                                    | ☐      |
| BUG-015 | `src/hooks/useUnifiedChat.ts`                  | Review     | Complex hook – assess for separation; duplicate with `useMessageHandler`.                                            | ☐      |
| BUG-016 | `src/lib/services/ChatCreationService.ts`      | Review     | Ensure error handling and type safety; duplicate logic with `MigrationService`.                                      | ☐      |
| BUG-017 | `src/lib/services/MigrationService.ts`         | Review     | Verify migration steps are idempotent; DRY with other service utilities.                                             | ☐      |
| BUG-018 | `src/lib/services/UnauthenticatedAIService.ts` | Review     | Check API key handling, rate limiting, and duplicated request logic.                                                 | ☐      |
| BUG-019 | `src/lib/repositories/ConvexChatRepository.ts` | Review     | Ensure correct Convex type imports (no abstraction layer); duplicate queries with `ChatRepository`.                  | ☐      |
| BUG-020 | `src/lib/repositories/ChatRepository.ts`       | Review     | Verify abstraction does not re-export Convex types; DRY with `LocalChatRepository`.                                  | ☐      |
| BUG-021 | `src/lib/repositories/LocalChatRepository.ts`  | Review     | Ensure local storage sync matches Convex schema; duplicate logic with `validation/localStorage`.                     | ☐      |
| BUG-022 | `src/components/LoadingBoundary.tsx`           | Review     | Confirm proper error boundary usage; duplicate with `ErrorBoundary.tsx`.                                             | ☐      |
| BUG-023 | `src/components/ErrorBoundary.tsx`             | Review     | Ensure fallback UI is accessible; DRY with `LoadingBoundary`.                                                        | ☐      |
| BUG-024 | `src/components/ResponsiveChatLayout.tsx`      | Review     | Check responsive breakpoints; duplicate CSS with `mobile-sidebar-fix.css`.                                           | ☐      |
| BUG-025 | `src/components/MobileSidebar.tsx`             | Review     | Verify sidebar timing logic; duplicate with `useSidebarTiming`.                                                      | ☐      |
| BUG-026 | `src/components/ReasoningDisplay.tsx`          | Review     | Ensure reasoning data is sanitized; duplicate with `CitationRenderer`.                                               | ☐      |
| BUG-027 | `src/components/CitationRenderer.tsx`          | Review     | Validate citation URLs; DRY with `ContentWithCitations`.                                                             | ☐      |
| BUG-028 | `src/components/ContentWithCitations.tsx`      | Review     | Check for repeated rendering logic with `MarkdownWithCitations`.                                                     | ☐      |
| BUG-029 | `src/components/MarkdownWithCitations.tsx`     | Review     | Ensure markdown parser options are consistent; duplicate with other markdown components.                             | ☐      |
| BUG-030 | `src/components/FollowUpPrompt.tsx`            | Review     | Verify prompt generation does not repeat logic in `useEnhancedFollowUpPrompt`.                                       | ☐      |
| BUG-031 | `src/hooks/useEnhancedFollowUpPrompt.ts`       | Review     | Check for duplicated prompt logic with `FollowUpPrompt`.                                                             | ☐      |
| BUG-032 | `src/hooks/useAutoCreateFirstChat.ts`          | Review     | Ensure auto‑creation respects auth state; duplicate with `useChatNavigation`.                                        | ☐      |
| BUG-033 | `src/hooks/useDeletionHandlers.ts`             | Review     | Verify deletion cascade; duplicate with `useMessageHandler`.                                                         | ☐      |
| BUG-034 | `src/hooks/useIsMobile.ts`                     | Review     | Confirm media query handling; duplicate with `useSidebarTiming`.                                                     | ☐      |
| BUG-035 | `src/hooks/useKeyboardShortcuts.ts`            | Review     | Ensure shortcuts are scoped; duplicate with `useServices`.                                                           | ☐      |
| BUG-036 | `src/hooks/useMetaTags.ts`                     | Review     | Validate meta tag updates; duplicate with `useServices`.                                                             | ☐      |
| BUG-037 | `src/hooks/useServices.ts`                     | Review     | Service injection may be duplicated across hooks.                                                                    | ☐      |
| BUG-038 | `src/hooks/useSidebarTiming.ts`                | Review     | Timing logic may overlap with `useIsMobile`.                                                                         | ☐      |
| BUG-039 | `src/hooks/useUnifiedChat.ts`                  | Review     | Complex state may cause race conditions – see race‑condition tests.                                                  | ☐      |
| BUG-040 | `src/lib/utils/telemetry.ts`                   | Review     | Ensure no PII is logged; duplicate with `logger.ts`.                                                                 | ☐      |
| BUG-041 | `src/lib/logger.ts`                            | Review     | Verify log levels and formatting; duplicate with `telemetry.ts`.                                                     | ☐      |
| BUG-042 | `src/lib/share.ts`                             | Review     | Ensure share URL generation is consistent; duplicate with `share.mjs`.                                               | ☐      |
| BUG-043 | `src/lib/share.mjs`                            | Review     | Verify module format compatibility.                                                                                  | ☐      |
| BUG-044 | `src/lib/clipboard.ts`                         | Review     | Ensure clipboard API usage is safe across browsers.                                                                  | ☐      |
| BUG-045 | `src/lib/env.ts`                               | Review     | Validate environment variable access (use `import.meta.env`).                                                        | ☐      |
| BUG-046 | `src/lib/utils.ts`                             | Review     | General utilities may duplicate functionality elsewhere.                                                             | ☐      |
| BUG-047 | `src/App.tsx`                                  | Review     | Large root component – consider splitting; duplicate layout logic with `ResponsiveChatLayout`.                       | ☐      |
| BUG-048 | `src/main.tsx`                                 | Review     | Ensure proper error handling during app bootstrap.                                                                   | ☐      |
| BUG-049 | `src/SignOutButton.tsx`                        | Review     | Verify sign‑out flow clears all client state.                                                                        | ☐      |
| BUG-050 | `src/components/SignInModal.tsx`               | Review     | Ensure auth errors are displayed; duplicate with `SignUpModal`.                                                      | ☐      |
| BUG-051 | `src/components/SignUpModal.tsx`               | Review     | Validate password rules; duplicate with `SignInModal`.                                                               | ☐      |
| BUG-052 | `src/components/SearchProgress.tsx`            | Review     | Check progress bar updates correctly; duplicate with other progress components.                                      | ☐      |
| BUG-053 | `src/components/ChatSidebar.tsx`               | Review     | Verify sidebar state sync; duplicate with `MobileSidebar`.                                                           | ☐      |
| BUG-054 | `src/components/ChatControls.tsx`              | Review     | Ensure control callbacks are memoized; duplicate with `MessageInput`.                                                | ☐      |
| BUG-055 | `src/components/ReasoningDisplay.tsx`          | Review     | Ensure reasoning data is not stale; duplicate with `FollowUpPrompt`.                                                 | ☐      |
| BUG-056 | `src/components/ResponsiveChatLayout.tsx`      | Review     | Confirm layout does not cause overflow; duplicate with CSS fixes.                                                    | ☐      |
| BUG-057 | `src/components/LoadingBoundary.tsx`           | Review     | Ensure fallback UI is accessible.                                                                                    | ☐      |
| BUG-058 | `src/components/ErrorBoundary.tsx`             | Review     | Verify error capture works for async errors.                                                                         | ☐      |
| BUG-059 | `src/components/ChatInterface.tsx`             | Review     | Component exceeds 500 lines – split into sub‑components.                                                             | ☐      |
| BUG-060 | `src/components/ChatControls.tsx`              | Review     | Duplicate event handling with `MessageInput`.                                                                        | ☐      |
| BUG-061 | `src/components/ChatControls.tsx`              | Review     | Potential memory leak on unmounted listeners.                                                                        | ☐      |
| BUG-062 | `src/components/ChatInterface.tsx`             | Review     | Verify useEffect dependencies are exhaustive.                                                                        | ☐      |
| BUG-063 | `src/components/ChatInterface.tsx`             | Review     | Check for stale closures causing race conditions.                                                                    | ☐      |
| BUG-064 | `src/components/ChatInterface.tsx`             | Review     | Ensure proper cleanup of subscriptions.                                                                              | ☐      |
| BUG-065 | `src/components/ChatInterface.tsx`             | Review     | Look for duplicated rendering logic with `MessageList`.                                                              | ☐      |
| BUG-066 | `src/components/MessageList.tsx` (if exists)   | Review     | Verify virtualization for long lists.                                                                                | ☐      |
| BUG-067 | `src/components/ChatProgress.tsx` (if exists)  | Review     | Ensure progress updates are throttled.                                                                               | ☐      |
| BUG-068 | `src/components/ChatControls.tsx`              | Review     | Ensure accessibility attributes (aria‑label).                                                                        | ☐      |
| BUG-069 | `src/components/ChatControls.tsx`              | Review     | Duplicate styling with Tailwind utilities – consider extracting.                                                     | ☐      |
| BUG-070 | `src/components/ChatInterface.tsx`             | Review     | Verify error handling for Convex query failures.                                                                     | ☐      |
| BUG-071 | `src/components/ChatInterface.tsx`             | Review     | Ensure optimistic UI updates are correctly rolled back.                                                              | ☐      |
| BUG-072 | `src/components/ChatInterface.tsx`             | Review     | Check for unnecessary re‑renders – memoize sub‑components.                                                           | ☐      |
| BUG-073 | `src/components/ChatInterface.tsx`             | Review     | Validate that all props are typed without `any`.                                                                     | ☐      |
| BUG-074 | `src/components/ChatInterface.tsx`             | Review     | Ensure no direct DOM manipulation (use refs).                                                                        | ☐      |
| BUG-075 | `src/components/ChatInterface.tsx`             | Review     | Verify that all external data is sanitized before rendering.                                                         | ☐      |
| BUG-076 | `src/components/ChatInterface.tsx`             | Review     | Look for duplicated logic with `useMessageHandler`.                                                                  | ☐      |
| BUG-077 | `src/components/ChatInterface.tsx`             | Review     | Ensure proper handling of loading states.                                                                            | ☐      |
| BUG-078 | `src/components/ChatInterface.tsx`             | Review     | Check for missing keys in list rendering.                                                                            | ☐      |
| BUG-079 | `src/components/ChatInterface.tsx`             | Review     | Verify that all async calls are awaited.                                                                             | ☐      |
| BUG-080 | `src/components/ChatInterface.tsx`             | Review     | Ensure that any use of `setState` inside loops is avoided.                                                           | ☐      |
| BUG-081 | `src/components/ChatInterface.tsx`             | Review     | Confirm that component respects dark mode.                                                                           | ☐      |
| BUG-082 | `src/components/ChatInterface.tsx`             | Review     | Ensure that any external libraries are up‑to‑date (e.g., `react-markdown`).                                          | ☐      |
| BUG-083 | `src/components/ChatInterface.tsx`             | Review     | Check for any console.log statements left in production code.                                                        | ☐      |
| BUG-084 | `src/components/ChatInterface.tsx`             | Review     | Verify that error boundaries wrap this component where needed.                                                       | ☐      |
| BUG-085 | `src/components/ChatInterface.tsx`             | Review     | Ensure that any timers are cleared on unmount.                                                                       | ☐      |
| BUG-086 | `src/components/ChatInterface.tsx`             | Review     | Validate that all network requests have timeout handling.                                                            | ☐      |
| BUG-087 | `src/components/ChatInterface.tsx`             | Review     | Ensure that any use of `any` is replaced with proper types.                                                          | ☐      |
| BUG-088 | `src/components/ChatInterface.tsx`             | Review     | Check for duplicated CSS classes – extract to shared style.                                                          | ☐      |
| BUG-089 | `src/components/ChatInterface.tsx`             | Review     | Verify that component is covered by unit and integration tests.                                                      | ☐      |
| BUG-090 | `src/components/ChatInterface.tsx`             | Review     | Ensure that the component does not exceed the 500‑line limit after refactoring.                                      | ☐      |

---

_Add new rows as you discover additional files or issues._
