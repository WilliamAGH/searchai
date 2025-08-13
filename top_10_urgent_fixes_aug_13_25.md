# Top 10 Urgent Fixes — SearchAI.io (Aug 13, 2025)

Purpose: Prioritized actions to improve stability, maintainability, and type safety. Each item references tasks in bug_fixes_aug_13_25.md.

- 1. T-0001 Split `useUnifiedChat.ts` (900 LOC)

  - Why: Exceeds 500-line limit; complex state/effects hinder changes and reviews.
  - Impact: High (P1) — reduces bugs/regressions, accelerates future work.
  - Plan: Extract state, actions, effects into `hooks/useUnifiedChat/*` modules.
  - Success: Each file < 250 LOC; no behavior change; tests pass.

- 2. T-0024 Split `MessageList.tsx` (672 LOC)

  - Why: Exceeds 500-line limit; mixes rendering, scroll, clipboard, sources.
  - Impact: High (P1) — unlocks perf/lint fixes, improves readability.
  - Plan: Extract `MessageItem`, `MessageSources`, `ScrollToBottomFab`, `DeletionControls`.
  - Success: Components < 200–250 LOC; remove top-level eslint-disables.

- 3. T-0025 Split `ChatInterface.tsx` (530 LOC)

  - Why: Exceeds 500-line limit; tight coupling of UI and orchestration.
  - Impact: High (P1) — safer iteration on UI/flows.
  - Plan: Extract header/body/footer and modal handlers; reuse hooks.
  - Success: Main file < 250 LOC; unchanged behavior.

- 4. T-0002 DRY: Centralize SearchResult validator — Completed

  - Why: Duplicated validators across `convex/messages.ts` and `convex/search.ts` risk drift.
  - Impact: High (P2) — single source of truth for validation.
  - Plan: `convex/lib/validators.ts` with `vSearchResult`; import at call sites.
  - Success: One definition; all call sites updated.

- 5. T-0026 Re-enable plan cache invalidation on deletes — Completed

  - Why: Current TODO disables planner cache invalidation after message deletion.
  - Impact: High (P2) — prevents stale search planning.
  - Plan: Provide stable internal action or event to invalidate; avoid cycles.
  - Success: Deleting messages invalidates planner cache; no circular deps.

- 6. T-0030/T-0042 Replace `v.any()` and unsafe casts in chat messages — Completed

  - Why: `v.array(v.any())` and `as unknown as` reduce safety.
  - Impact: Medium-High (P2) — compile-time safety, fewer runtime surprises.
  - Plan: Import `Doc<"chats">`; define minimal validator shape for messages.
  - Success: No `v.any()`; typed fields; unchanged behavior.

- 7. T-0003 Reduce `any` usage in `convex/search.ts` — Completed (first pass)

  - Why: Weak typing across planning pipeline.
  - Impact: Medium-High (P2) — safer refactors and debugging.
  - Plan: Local interfaces; use Convex types where appropriate; keep TS2589 notes.
  - Success: Replace `any` in non-TS2589 spots; documented exceptions.

- 8. T-0027 Remove duplicate share modules — Completed

  - Why: `src/lib/share.ts` and `src/lib/share.mjs` duplicate logic; currently unused.
  - Impact: Medium (P2) — reduces confusion and bundle clutter.
  - Plan: Keep TS version; delete `.mjs`; or remove both if not needed.
  - Success: Single source or clean removal; tests unaffected.

- 9. T-0029 Remove eslint-disables via refactors — Completed

  - Why: Hiding perf/hook issues contradicts policy.
  - Impact: Medium (P2) — sustained code health.
  - Plan: Memoize arrays/objects, stabilize callbacks, correct deps.
  - Success: No `eslint-disable` in src (excluding Convex \_generated).

- 10. T-0040 CI-friendly Vitest config — Added script; sandbox still limited
  - Why: Sandbox worker pool crash indicates poor CI ergonomics.
  - Impact: Medium (P2) — reliable CI gating for regressions.
  - Plan: Add fallback flag/env for single-thread/forks in `npm test`.
  - Success: `npm run test` passes on dev machines and CI/sandbox.

Notes & Next Priorities

- T-0041 FE/BE SearchResult alignment — Completed (FE requires relevanceScore now).
- T-0036 CORS allowlist — Completed; verify `CONVEX_ALLOWED_ORIGINS` in envs.
- T-0007 Pagination for large chats — Implement Convex paginated query + hook (scaffold exists: `usePaginatedMessages`).
- T-0009 HTTP input validation — Consider wiring `convex/http/validators` where appropriate.
- T-0010 XSS defense — We use `rehype-sanitize`; add tests for adversarial markdown/HTML.
- T-0024/T-0025/T-0001 Splits — Proceed with component/hook decomposition to meet 500 LOC standard.
