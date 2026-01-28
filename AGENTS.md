---
description: "searchai-io agent rules - Convex runtimes, git safety, clean code, and verification workflow"
alwaysApply: true
---

# searchai-io Agent Rules

## Document Organization [ORG]

- [ORG1] Purpose: keep every critical rule within the first ~250 lines; move long examples/notes to Appendix (within this file only; no external “appendix” docs).
- [ORG2] Structure: Rule Summary first, then detailed sections keyed by short hashes (e.g., `[GT1a]`).
- [ORG3] Usage: cite hashes when giving guidance or checking compliance; add new rules without renumbering older ones.
- [ORG4] One Hash, One Rule: each `[XX#x]` bullet is a single, succinct rule statement. Put HOW/WHY in `docs/` (<= 350 LOC each) and reference it from the rule.

## Rule Summary [SUM]

- [ZA1a-c] Zero Tolerance Policy (zero assumptions, validation workflow, forbidden practices)
- [LOC1a-d] Repository File Length Limit (<= 350 LOC; excludes generated files)
- [DOC1a-f] Documentation Architecture (AGENTS = rules; docs = how/why; no barrels; no .cursor rules)
- [GT1a-j] Git, history safety, hooks/signing, lock files, and clean commits
- [CX1a-h] Convex runtimes: `"use node";` boundaries for Node-only imports
- [RC1a-d] Root Cause Resolution (single implementation, no fallbacks, no shims/workarounds)
- [IM1a-d] Import Rules (no barrel files, `@/` alias only, no relative imports)
- [LGY1a-c] No Legacy Code (no new code in legacy paths; migrate touched logic)
- [FS1a-e] File Creation & Clean Architecture (search first, strict types, single responsibility)
- [AB1a-c] Abstraction Discipline (reuse-first, no anemic wrappers)
- [EH1a-c] Error Handling (no swallowing, no silent degradation)
- [TY1a-f] Type Safety & Zod (Zod v4, strict types, no `any`)
- [VL1a-d] Validation Architecture (no duplication, trust Convex, Zod at external boundaries only)
- [ZV1a-e] Zod Validation Errors (log failures, record identifiers, discriminated unions)
- [UI1a-c] UI Status & Overlays (inline-only; never block input)
- [HP1a-c] HTTP Endpoints (Convex): validation, clarity, no ambiguous routing
- [CS1a-c] Code Search Policy (semantic-first; validate Convex code before commit)
- [VR1a-e] Verification Loops (build/typecheck/lint/tests/e2e)
- [LG1a] Language (American English only)

## [LOC1] Repository File Length Limit (Mandatory)

- [LOC1a] **Hard Cap**: All written, non-generated source files in this repo MUST be <= 350 lines. This includes `AGENTS.md` itself.
- [LOC1b] **SRP Enforcer**: This 350-line "stick" forces modularity (DDD/SRP); > 350 lines = too many responsibilities (see [MO1d]).
- [LOC1c] **Zero Tolerance**: No edits allowed to files > 350 LOC (even legacy); you MUST split/retrofit before applying your change.
- [LOC1d] **Enforcement**: `npm run lint:loc` MUST pass. `npm run validate` MUST include `lint:loc` and fail if any non-generated file exceeds the limit.
- [LOC1e] **Exclusions**: Generated files (lockfiles, Convex `_generated/`, build outputs).

## [DOC1] Documentation Architecture (Mandatory)

- [DOC1a] **Canonical Rules**: `AGENTS.md` is the ONLY canonical source for agent rules. Rules live here as single hash bullets (see [ORG4]).
- [DOC1b] **Docs Purpose**: `docs/` files explain HOW and WHY to follow rules. Docs MUST NOT restate/redefine rules; they reference rule IDs (e.g., "See [IM1d]").
- [DOC1c] **Docs Scope**: Each `docs/*.md` file covers one narrow topic and MUST be <= 350 lines (see [LOC1]).
- [DOC1d] **No Doc Barrels**: Do not create documentation "index"/"barrel" files whose primary purpose is to list other docs (e.g., `docs/**/index.md`). Every doc must be substantive.
- [DOC1e] **No .cursor Rules**: Do not add new `.cursor/rules/*.mdc` files. Migrate any existing `.cursor/rules` content into `docs/` and delete the `.cursor/rules` source.
- [DOC1f] **Prerequisite Reading**: When a workflow requires a doc to be read first, the rule MUST name the exact doc path (e.g., "Before editing `tests/e2e/*`, read `docs/testing-e2e.md`.").

## [ZA1] Epistemic Humility (Zero Assumptions)

- [ZA1a] **Assume Blindness**: Your training data for APIs/versions is FALSE until verified.
- [ZA1b] **Scout Phase**: Before coding, use tools (`context7`, `perplexity`, `npm list`) and check `node_modules/` to verify existence/signatures of APIs.
- [ZA1c] **Local Truth**: Never assume library behavior; verify against the installed version in `package.json` and `node_modules/`.
- [ZA1d] **Validation**: `npm run validate` must pass with 0 errors before asking for review.
- [ZA1e] **Forbidden Practices**:
  - No `any`, loose typing, `as` assertions, or `as unknown as`.
  - No polyfills for modern browsers/runtimes.
  - No trusting memory—verify every import/API/config against current docs.
- [ZA1f] **Dependency Verification**: You MUST research dependency questions and correct usage to ensure idiomatic patterns. Never use legacy or `@deprecated` features. Verification is facilitated by reviewing related code directly in `node_modules` and using online tool calls.
- [ZA1g] **Dependency Search**: To search `node_modules` efficiently with `ast-grep`, target specific packages: `ast-grep run --pattern '...' node_modules/<package>`. Do NOT scan the entire `node_modules` folder.

## [GT1] Git, History, Hooks, Lock Files

- [GT1a] Never bypass pre-commit hooks or commit signing.
  - Forbidden: `git commit -n`, `git commit -n -c commit.gpgsign=false`, setting `HUSKY=0` / `SKIP_HUSKY=1`, or otherwise forcing a commit.
- [GT1b] If hooks fail (network/SSO agent issues, Convex checks, etc.), fix the environment or follow the project’s documented process; if blocked, escalate in the task thread—do not force the commit.
- [GT1c] Read-only git commands (e.g., `git status`, `git diff`, `git log`, `git show`) never require permission. Any git command that writes to the working tree, index, or history requires explicit permission (see [GT1g]).
- [GT1d] Commit message standards: one logical change per commit; describe the change and purpose; no tooling/AI references; no `Co-authored-by` or AI attribution.
- [GT1e] Do not amend or rewrite history (no `--amend`, no force pushes) without explicit user permission.
- [GT1f] Do not change branches (checkout/merge/rebase/pull) unless the user explicitly instructs it.
- [GT1g] Destructive git commands are prohibited unless explicitly ordered by the user (e.g., `git restore`, `git reset`, force checkout). Destructive commands are a subset of write operations; read-only commands are always allowed without permission per [GT1c].
- [GT1j] Examples of write operations that require permission: `git add`, `git commit`, `git checkout`, `git merge`, `git rebase`, `git reset`, `git restore`, `git clean`, `git cherry-pick`.
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

## [RC1] Root Cause Resolution — No Fallbacks

- [RC1a] **One Way**: Ship one proven implementation—no fallback paths, no "try X then Y", no silent degradation.
- [RC1b] **No Shims**: **NO compatibility layers, shims, adapters, or wrappers** that hide defects. NO `as unknown as T`.
- [RC1c] **Fix Roots**: Investigate → understand → fix root causes. Do not add band-aids (re-exports, polyfills, bridge code) to silence errors.
- [RC1d] **Dev Logging**: Dev-only logging is allowed to learn (must not change behavior, remove before shipping).

## [ID1] Idiomatic Patterns & Defaults

- [ID1a] **Defaults First**: Always prefer the idiomatic, expected, and default patterns provided by the framework, library, or SDK (e.g., Next.js, React, Convex, Zod).
- [ID1b] **Custom Justification**: Custom implementations require a compelling reason (performance bottleneck, missing feature) and deep expertise. If you can't justify it, use the standard way.
- [ID1c] **No Reinventing**: Do not build custom utilities for things the platform already does (e.g., use standard `Request`/`Response`, standard Zod methods, standard React hooks).

- [ID1d] **Node Modules**: Make careful use of `node_modules` dependencies. Do not make assumptions—use the correct idiomatic behavior of dependencies wherever possible to avoid unnecessary boilerplate or duplicate code.

## [CC1] Clean Code & DDD (Mandatory)

- [CC1a] **Mandatory Principles**: Clean Code principles (Robert C. Martin) and Domain-Driven Design (DDD) are **mandatory** and required in this repository.
- [CC1b] **DRY (Don't Repeat Yourself)**: Avoid redundant code. Reuse code where appropriate and consistent with clean code principles.
- [CC1c] **YAGNI (You Aren't Gonna Need It)**: Do not build features or abstractions "just in case". Implement only what is required for the current task.
- [CC1d] **Clean Architecture**: Dependencies point inward. Domain logic has zero framework imports.

## [IM1] Import Rules

- [IM1a] **No Barrel Files**: `index.ts` re-exports are **forbidden**. Import directly from the source file.
- [IM1b] **Use Aliases in `src/`**: In `src/**/*` files, always use `@/` alias for local imports (e.g., `@/components/Chat`)—never relative `./` or `../` unless strictly necessary for sibling assets.
- [IM1c] **Direct Imports**: Import specific symbols; avoid `import * as`.
- [IM1d] **No `@/` in Convex**: In `convex/**/*` files, `@/` path aliases are **FORBIDDEN**. Convex's esbuild bundler does not read `convex/tsconfig.json` paths; `@/` imports will pass IDE typechecking but **fail at bundle time**. Use relative imports within convex (e.g., `../lib/foo`). Enforced by `npm run lint:convex-imports`.

## [LGY1] No Legacy Code

- [LGY1a] **Definition**: Legacy = files/dirs labeled `legacy`, `deprecated`, `v1`, `old`, or explicitly marked in comments/docs.
- [LGY1b] **Freeze**: Do not add new code or dependencies in legacy paths.
- [LGY1c] **Migrate**: If you touch legacy logic, migrate it to canonical paths/patterns. If safe migration is impossible, stop and ask.

## [FS1] File Creation & Clean Architecture

- [FS1a] **Search First**: Search exhaustively for existing logic → reuse or extend → only then create new files.
- [FS1b] **Single Responsibility**: New features belong in NEW files named for their single responsibility. Do not cram code into existing files.
- [FS1c] **Clean Architecture**: Dependencies point inward. Domain logic has zero framework imports.
- [FS1d] **One Way**: There is one single way to do everything. No exceptions. If something is updated, update all consumers immediately and remove the old code.
- [FS1e] **No Duplication**: Single sources of truth. Do not scatter duplicate constants or config fragments.
- [FS1f] **Facade Pattern**: Convex backend features MUST use the `feature.ts` (public facade) + `feature/` (private module) pattern. Facades re-export only; modules contain logic. See `docs/contracts/code-change.md`.

## [MO1] No Monoliths

- [MO1a] **No Monoliths**: Avoid multi-concern files and catch-all modules.
- [MO1b] **Split**: New work starts in new files; when touching a monolith, extract at least one seam.
- [MO1c] **Halt**: If safe extraction impossible, halt and ask.
- [MO1d] **Strict SRP**: Each unit serves one actor; separate logic that changes for different reasons.
- [MO1e] **Boundary Rule**: Cross-module interaction happens only through explicit, typed contracts with dependencies pointing inward; don’t reach into other modules’ internals.
- [MO1f] **Decision Logic**: New feature → New file; Bug fix → Edit existing; Logic change → Extract/Replace.
- [MO1g] **Extension (OCP)**: Add functionality via new classes/composition; do not modify stable code to add features.
- **Contract**: `docs/contracts/code-change.md`

## [AB1] Abstraction Discipline

- [AB1a] **No Anemic Wrappers**: Do not add classes/modules that only forward calls or rename fields without adding behavior.
- [AB1b] **Earn Reuse**: New abstractions must earn reuse—extend existing code first; only add a helper when it removes real duplication.
- [AB1c] **Delete Unused**: Delete unused exports/code instead of keeping them "just in case".

## [EH1] Error Handling — No Swallowing

- [EH1a] **Never Swallow**: No empty catch blocks, no `catch {}` that returns defaults, no `.catch(() => undefined)`.
- [EH1b] **Surface Failures**: If you catch, add context and rethrow or surface a typed error.
- [EH1c] **UI Feedback**: UI must surface failures via error boundaries or explicit error states, not silent fallbacks.

## [TY1] Type Safety & Zod

- [TY1a] **Strictness**: `noImplicitAny` is enabled. Explicit `any` is **FORBIDDEN** (except for Convex recursion limits).
- [TY1b] **No `unknown` Propagation**: `unknown` is allowed ONLY at system boundaries. Validate immediately via Zod.
- [TY1c] **Zod v4**: Import from `zod/v4`. Exception: OpenAI Agents tool params use v3 (see `docs/contracts/sdk-integration.md`).
- [TY1d] **Schema Location**: Canonical Zod schemas live in `convex/schemas/`. See [VL1].
- [TY1e] **Validation**: External data (third-party APIs) MUST be validated. Convex-returned data needs NO re-validation.
- [TY1f] **No `any`**: See [ZA1c].
- [TY1g] **SDK Tool Types**: See `docs/contracts/sdk-integration.md` for required OpenAI Agent tool type annotations.

## [VL1] Validation Architecture — No Duplication

- [VL1a] **Convex `v` validators**: Required for database schema and function args. Cannot be replaced.
- [VL1b] **Zod schemas**: Use ONLY at external API boundaries (data Convex doesn't see). Canonical location: `convex/schemas/`.
- [VL1c] **Trust Convex**: Data from Convex queries/mutations is already validated. Do NOT re-validate with Zod.
- [VL1d] **No Duplication**: Never define the same schema in multiple files. Import from canonical location.

## [ZV1] Zod Validation Error Handling — No Silent Failures

- [ZV1a] **Use `safeParse()`**: Never use `.parse()` on external data. It throws and crashes rendering. Always use `.safeParse()`.
- [ZV1b] **Discriminated Unions**: Return `{ success: true, data }` or `{ success: false, error }`, not `null` or silent fallbacks.
- [ZV1c] **Log with Record Identifiers**: Every validation failure log MUST include context identifying WHICH record failed (URL, ID, index, etc.). Use `logZodFailure(context, error, payload)`.
- [ZV1d] **Canonical Utilities**: Use `convex/lib/validation/zodUtils.ts` for `logZodFailure`, `safeParseWithLog`, `safeParseOrNull`, `parseArrayWithLogging`, and `ValidationResult<T>` type.
- [ZV1e] **No Silent Degradation**: If validation fails, log it. Never silently return defaults without logging the failure first.

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
