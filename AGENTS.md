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
Convex dashboard for this project: https://dashboard.convex.dev/d/diligent-greyhound-240

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
