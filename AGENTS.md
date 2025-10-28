# Agent Development Notes

## Node.js-only helpers must live in “use node” modules

Convex actions run in the V8 runtime by default. Any helper that imports Node
built-ins (for example `node:crypto`) will crash during `npx convex dev` with an
error similar to:

```
✘ [ERROR] Could not resolve "node:crypto"
It looks like you are using Node APIs from a file without the "use node" directive.
```

To avoid this:

1. Put `"use node";` at the top of every file that consumes Node-only modules.
   (Note: The exact line position doesn't matter - before or after comments is fine.)
2. Keep those files limited to actions/utilities that actually require Node.
3. Call them only from other `"use node";` actions.
4. **CRITICAL**: Make sure the file is **only imported by other actions**. If any query, mutation, or V8-runtime file imports it, the bundler will try to bundle it for V8 and fail.

Example: `convex/agents/orchestration.ts` uses `createHmac` from `node:crypto`
for signing SSE payloads. The file **must** begin with `"use node";` so Convex
executes it in the Node runtime.

Reference: [Convex runtimes documentation](https://docs.convex.dev/functions/runtimes#nodejs-runtime).
[Convex dashboard](https://dashboard.convex.dev/d/diligent-greyhound-240)

### If you see `Could not resolve "node:crypto"`

- It means some file importing `node:*` APIs is being bundled for the V8 runtime.
- Fix it by moving that code into a `"use node";` module and only importing it
  from actions/components that also run in Node. Per the docs, **only actions**
  may run in the Node.js runtime, so Node-only helpers must live alongside the
  action that calls them.
- Do **not** try to “fix” this by ripping out the other engineer’s code. Follow
  the layering policy below.

## ABSOLUTE RULE: Never undo another engineer’s edits

If a file already contains changes (even if they look “wrong”), do **not**
revert or overwrite them unless the original author explicitly requested it in
this task. We build iteratively—rolling back someone else’s work destroys
context, creates merge hell, and violates project policy. When in doubt: layer
your fix on top, leave prior edits intact, and raise questions in the task
thread instead of unilaterally reverting.

## Git commits & hooks (NEVER bypass)

- Do not bypass pre-commit hooks or commit signing. This is dangerous and can
  hide build/type/Convex validation failures.
  - Forbidden: `git commit -n`, `git commit -n -c commit.gpgsign=false`,
    setting `HUSKY=0` or `SKIP_HUSKY=1`, or disabling signing to force a
    commit.
- If hooks fail due to network/SSO agent issues (e.g. 1Password) or Convex
  checks:

  - Fix the environment or temporarily disable the failing integration per the
    project’s documented process, then re-run hooks.
  - If blocked, escalate in the task thread; do not force the commit.

- Request explicit permission for Git operations and use proper tool
  permissions (e.g., `git_write`). Never attempt to sidestep policy checks.

- Commit message standards:

  - One logical change per commit; no bundling unrelated edits.
  - Describe the specific change and its purpose.
  - Never reference tooling or reviewers (Copilot, Cursor, AI, etc.).
  - Do not add `Co-authored-by` lines or any AI attribution.

- History and branches:

  - Do not amend or rewrite history (no `--amend`, no force pushes) without
    explicit user permission.
  - Do not change branches (checkout, merge, rebase, pull) unless the user
    explicitly instructs it.
  - Treat all staged or unstaged changes as intentional unless the user says
    otherwise; never "clean up" someone else’s work unprompted.

- Destructive Git commands are prohibited unless explicitly ordered by the
  user: `git restore`, `git reset`, force checkout, etc.

## Language

- Use American English exclusively. British spellings are forbidden in code and
  documentation.

## File creation policy

- Prefer edits within existing files. Do not create new files unless necessary
  for the task’s goal; if a brand-new file is truly required, pause and obtain
  explicit user approval first (especially for new top-level modules or
  components).

## Convention over configuration + DRY (front-end/Convex)

- Favor existing components, hooks, and utilities over creating wrappers or
  duplicates.
- Good abstractions: shared constants, validators, provider config, focused
  utilities that reduce repetition.
- Bad abstractions: wrappers around simple APIs, generic helpers that obscure
  intent, duplicate status/overlay components.
- Large files: If a file approaches ~500 lines, consider extracting cohesive
  pieces or reusing existing modules rather than adding more lines.

## UI status & overlays policy (inline-only)

- Status must render inline within the chat content area (e.g., `MessageItem`,
  `SearchProgress`).
- Do not add global overlays/banners/toasts that can overlap or obstruct the
  message input—especially on mobile.
- Mobile overlays covering input are banned. If a temporary global indicator is
  ever needed for desktop-only debugging, guard it behind a dev flag and remove
  before commit/release.

## HTTP endpoints (Convex)

- Validate all input with Convex validators; keep routes simple and explicit.
- Enforce strict URL and length checks. Avoid regex path parameters that create
  ambiguity.
- Prefer agent endpoints and SSE streaming utilities already present in the
  codebase; do not reintroduce legacy routes.

## Code search policy

- Prefer semantic search to locate behavior and architecture-level patterns.
- Use exact-text searches only for symbols/strings once context is known.
- When touching Convex code, run the provided scripts to validate imports and
  generated types before committing.

## Verification loops (mandatory)

Before opening a PR or merging, verify with real outputs:

- Build & types: `npm run build` and `npm run typecheck`
- Lint: `npm run lint`
- Tests (full suite): `npm run test:all`
- E2E (smoke/share flows): run Playwright with the required proxy runtime,
  e.g. `PLAYWRIGHT_RUNTIME=proxy npx playwright test -g "(smoke|share)"`

All checks must pass with no skipped tests and coverage meeting thresholds.
