---
description: "searchai-io agent rules - Convex runtimes, git safety, UI constraints, and verification workflow"
alwaysApply: true
---

# searchai-io Agent Rules

## Document Organization [ORG]

- [ORG1] Purpose: keep every critical rule within the first ~250 lines; move long examples/notes to Appendix.
- [ORG2] Structure: Rule Summary first, then detailed sections keyed by short hashes (e.g., `[GT1a]`).
- [ORG3] Usage: cite hashes when giving guidance or checking compliance; add new rules without renumbering older ones.

## Rule Summary [SUM]

- [ZT1a-c] Evidence-first / zero assumptions
- [GT1a-i] Git, history safety, hooks/signing, lock files, and clean commits
- [CX1a-h] Convex runtimes: `"use node";` boundaries for Node-only imports
- [ED1a-b] Editing discipline: never undo another engineer’s edits
- [FS1a-b] File creation policy (existing-first; explicit approval for new files)
- [DR1a-c] Convention-over-configuration + DRY (no duplicate wrappers; keep files small)
- [UI1a-c] UI status/overlays (inline-only; never block input)
- [HP1a-c] HTTP endpoints (Convex): validation, clarity, no ambiguous routing
- [CS1a-c] Code search policy (semantic-first; validate Convex code before commit)
- [VR1a-e] Verification loops (build/typecheck/lint/tests/e2e)
- [LG1a] Language (American English only)

## [ZT1] Evidence / No Assumptions

- [ZT1a] Do not assume behavior, APIs, or architecture—verify in the codebase/docs first.
- [ZT1b] When uncertain, pause and investigate rather than guessing.
- [ZT1c] Prefer evidence-backed answers (reference concrete files/paths when possible).

## [GT1] Git, History, Hooks, Lock Files

- [GT1a] Never bypass pre-commit hooks or commit signing.
  - Forbidden: `git commit -n`, `git commit -n -c commit.gpgsign=false`, setting `HUSKY=0` / `SKIP_HUSKY=1`, or otherwise forcing a commit.
- [GT1b] If hooks fail (network/SSO agent issues, Convex checks, etc.), fix the environment or follow the project’s documented process; if blocked, escalate in the task thread—do not force the commit.
- [GT1c] Request explicit permission for git operations and use the proper tool permissions (e.g., `git_write`); never attempt to sidestep policy checks.
- [GT1d] Commit message standards: one logical change per commit; describe the change and purpose; no tooling/AI references; no `Co-authored-by` or AI attribution.
- [GT1e] Do not amend or rewrite history (no `--amend`, no force pushes) without explicit user permission.
- [GT1f] Do not change branches (checkout/merge/rebase/pull) unless the user explicitly instructs it.
- [GT1g] Destructive git commands are prohibited unless explicitly ordered by the user (e.g., `git restore`, `git reset`, force checkout).
- [GT1h] Never delete lock files automatically (including `.git/index.lock`). Stop and ask for instruction.
- [GT1i] Treat existing staged/unstaged changes as intentional unless the user says otherwise; never “clean up” someone else’s work unprompted.

## [CX1] Convex Runtimes: Node-only Helpers Must Live in `"use node";` Modules

- [CX1a] Convex actions run in the V8 runtime by default.
- [CX1b] Any helper that imports Node built-ins (e.g., `node:crypto`) must be in a file that starts with `"use node";`.
- [CX1c] Directive placement note: `"use node";` must be at the top of the file; it may appear before or after comments (exact line position doesn’t matter).
- [CX1d] Keep `"use node";` modules limited to the actions/utilities that actually require Node.
- [CX1e] Only import Node-only helpers from other `"use node";` actions. If a V8-runtime file (query/mutation/default runtime) imports it, bundling will fail.
- [CX1f] If you see `Could not resolve "node:crypto"`, Node APIs are being bundled for the V8 runtime—move that code into a `"use node";` module and fix the import graph.
- [CX1g] Per Convex, only **actions** may run in the Node.js runtime; Node-only helpers must live alongside (and be imported only by) Node-runtime actions.
- [CX1h] Do not rip out other engineers’ code to “fix” runtime issues; follow the layering/import rules and make minimal, compatible changes.

References:

- Convex runtimes docs: https://docs.convex.dev/functions/runtimes#nodejs-runtime
- Convex dashboard: https://dashboard.convex.dev/d/diligent-greyhound-240

## [ED1] Editing Discipline (Protect Existing Work)

- [ED1a] Never undo another engineer’s edits (even if they look wrong) unless the original author explicitly requested it in this task.
- [ED1b] Layer your fix on top, keep prior edits intact, and raise questions in the task thread instead of reverting.

## [FS1] File Creation Policy

- [FS1a] Prefer edits within existing files; do not create new files unless necessary for the task’s goal.
- [FS1b] If a brand-new file is truly required (especially new top-level modules/components), pause and obtain explicit user approval first.

## [DR1] Convention over Configuration + DRY

- [DR1a] Favor existing components, hooks, and utilities over wrappers or duplicates.
- [DR1b] Good abstractions: shared constants/validators/provider config/focused utilities that reduce repetition. Bad abstractions: wrappers around simple APIs, generic helpers that obscure intent, duplicate overlay/status components.
- [DR1c] Large files: if a file approaches ~500 lines, prefer extracting cohesive pieces or reusing existing modules rather than adding more lines.

## [UI1] UI Status & Overlays Policy (Inline-only)

- [UI1a] Status must render inline within the chat content area (e.g., `MessageItem`, `SearchProgress`).
- [UI1b] Do not add global overlays/banners/toasts that can overlap or obstruct the message input—especially on mobile.
- [UI1c] If a temporary global indicator is ever needed for desktop-only debugging, guard it behind a dev flag and remove it before commit/release.

## [HP1] HTTP Endpoints (Convex)

- [HP1a] Validate all input with Convex validators; keep routes simple and explicit.
- [HP1b] Enforce strict URL and length checks. Avoid regex path parameters that create ambiguity.
- [HP1c] Prefer agent endpoints and SSE streaming utilities already present in the codebase; do not reintroduce legacy routes.

## [CS1] Code Search Policy

- [CS1a] Prefer semantic search to locate behavior and architecture-level patterns.
- [CS1b] Use exact-text searches for symbols/strings once context is known.
- [CS1c] When touching Convex code, run the provided scripts to validate imports and generated types before committing.

## [VR1] Verification Loops (Mandatory)

- [VR1a] Build & types: `npm run build` and `npm run typecheck`
- [VR1b] Lint: `npm run lint`
- [VR1c] Tests (full suite): `npm run test:all`
- [VR1d] E2E (smoke/share flows): run Playwright with the required proxy runtime, e.g. `PLAYWRIGHT_RUNTIME=proxy npx playwright test -g "(smoke|share)"`
- [VR1e] All checks must pass with no skipped tests and coverage meeting thresholds.

## [LG1] Language

- [LG1a] Use American English exclusively. British spellings are forbidden in code and documentation.

## Appendix [APP]

### [CXE1] Common Error Signal (Informational)

```text
✘ [ERROR] Could not resolve "node:crypto"
It looks like you are using Node APIs from a file without the "use node" directive.
```

### [CXE2] Example (Informational)

- `convex/agents/orchestration.ts` uses `createHmac` from `node:crypto` for signing SSE payloads; it must start with `"use node";` and must only be imported by other Node-runtime actions.

### [SR1] Search/Context Pipeline Notes (2025-11-25)

- [SR1a] Research agent output includes `scrapedContent` (full page text, summary, contextId, relevance) and `serpEnrichment` (knowledge graph, answer box, people-also-ask, related searches).
- [SR1b] Synthesis prompt consumes scraped content excerpts (~12k token budget; ~3k/page) plus SERP enrichment for citations.
- [SR1c] Scraper uses Cheerio for HTML parsing and falls back to Playwright when pages look JS-rendered; cache TTLs and URL normalization are centralized in `convex/lib/constants/cache.ts` and `convex/lib/url.ts`.
- [SR1d] SerpAPI provider returns enrichment and position-based relevance; search tool surfaces enrichment to the research agent.
