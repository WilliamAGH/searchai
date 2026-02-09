# Navigation Contract

> Rules: [FS1d] one way, [RC1a] no fallbacks, [MO1e] boundary rule.

## Architecture

The URL is the **single source of truth** for chat selection. All chat
selection flows through the URL; `useUrlStateSync` is the sole bridge
between URL and application state.

```text
User action
  ↓
useChatNavigation (navigateToChat / navigateHome / navigateWithVerification)
  ↓
URL changes (React Router)
  ↓
useUrlStateSync (the ONLY code that may call selectChat)
  ↓
currentChatId updated in state
```

## Hook Responsibilities

| Hook                | Responsibility       | May call                            |
| ------------------- | -------------------- | ----------------------------------- |
| `useChatNavigation` | Write URL            | `navigate()` only                   |
| `useUrlStateSync`   | Sync state from URL  | `selectChat()`, `navigate()`        |
| `useChatActions`    | Manage state         | `setState()` — see exceptions below |
| `useChatDataLoader` | Auto-select on mount | `setState()` — see below            |

### Exceptions (state changes outside URL control)

These are the ONLY places that may set `currentChatId` directly:

1. **`createChat()`** — Sets `currentChatId` immediately for optimistic UI.
   `useUrlStateSync` step 5 then navigates to `/chat/${id}`.
2. **`deleteChat()`** — Clears `currentChatId` when deleting the current
   chat. `useUrlStateSync` step 6 then navigates to `/`.
3. **`useChatDataLoader`** — Auto-selects the first chat on initial load
   when no chat is selected (returning-user UX). `useUrlStateSync` step 5
   then navigates to `/chat/${autoSelectedId}`.

All three cooperate with `useUrlStateSync` steps 5/6, which reconcile the
URL after state changes. This is intentional and documented in each file.

## Navigation Helpers (useChatNavigation)

| Function                       | When to use                    | Verification       |
| ------------------------------ | ------------------------------ | ------------------ |
| `navigateToChat(id)`           | Known-good chat (just created) | None               |
| `navigateWithVerification(id)` | Uncertain existence (sidebar)  | Checks `allChats`  |
| `navigateHome()`               | Deselect chat                  | None               |
| `handleSelectChat(id)`         | Sidebar click wrapper          | Delegates to above |

## Forbidden Patterns

These patterns cause URL flicker and MUST NOT be introduced:

1. **Direct `selectChat()` outside `useUrlStateSync`** — Creates a state
   change without a URL change, forcing the sync hook to reconcile in the
   wrong direction.

2. **Conditional return in `useUrlStateSync` step 3** — The return after
   dispatching `selectChat(targetChatId)` MUST be unconditional. A
   conditional return allows the stale `currentChatId` to leak into the
   URL before `selectChat` completes (the "Bugbot flicker" regression).

3. **Gating step 5 on `currentChatId === targetChatId`** — Breaks
   new-chat creation where `createChat` sets `currentChatId` but the URL
   is still `/` (targetChatId is null). Step 5 must fire whenever
   `currentChatId` exists on a chat route, regardless of `targetChatId`.

4. **Using `navigateWithVerification` for newly created chats** — The
   Convex reactive query (`allChats`) may not have updated yet, causing
   silent navigation failure. Use `navigateToChat` instead.

5. **Calling `chatActions.selectChat(null)` to deselect** — Use
   `navigateHome()` so the URL changes to `/` first; `useUrlStateSync`
   step 4 detects the pathname change and calls `selectChat(null)`.

6. **Removing the `prevPathname` guard from step 4** — Without it,
   auto-selection by `useChatDataLoader` (which sets `currentChatId`
   while the URL is already `/`) would be immediately undone.

## useUrlStateSync State Machine

Steps are evaluated top-to-bottom with early returns:

| Step | Guard                                            | Action                        | Protects against               |
| ---- | ------------------------------------------------ | ----------------------------- | ------------------------------ |
| 1    | —                                                | Resolve `targetChatId`        | —                              |
| 2    | `isResolving`                                    | Return early                  | Stale data during query load   |
| 3    | `targetChatId && currentChatId !== targetChatId` | `selectChat(id)` + return     | URL flicker during transitions |
| 4    | pathname changed to `/` && `currentChatId`       | `selectChat(null)` + return   | Deselection blocked by step 5  |
| 5    | `currentChatId && isChatRoute`                   | `navigate(/chat/id)` + return | New chat, opaque→internal URL  |
| 6    | `!currentChatId && !targetChatId && isChatRoute` | `navigate(/)`                 | Orphaned URL after delete      |

## Regression Checklist

Before modifying ANY navigation code, verify these scenarios pass:

1. **New chat creation** — Send message from `/`. URL must change to
   `/chat/<id>` after chat is created.
2. **Sidebar switch** — Click a different chat in the sidebar. URL must
   update without flicker to the old chat's path.
3. **Opaque ID resolution** — Navigate to `/chat/<opaque-id>`. URL must
   settle on `/chat/<internal-id>` after query resolves.
4. **Missing chat** — Navigate to `/chat/<nonexistent-id>`. Must redirect
   to `/` after query resolves to null.
5. **Delete current chat** — Delete the currently viewed chat. Must
   navigate to `/`.
6. **Deselect (navigateHome)** — Click to deselect the current chat.
   URL must change to `/` and `currentChatId` must clear to `null`.
7. **Rapid switching** — Click multiple chats in quick succession. Must
   settle on the last clicked chat without oscillation.

Run: `npx playwright test --config config/playwright.config.ts -g smoke --reporter=line`
