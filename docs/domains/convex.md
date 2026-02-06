# Convex Development

## Core Principles

- Use Convex's generated types from `./_generated/*` - never duplicate them
- All functions require `args` and `returns` validators (use `v.null()` for void)
- Use indexes instead of `.filter()` for queries
- Keep HTTP route arguments simple to avoid TypeScript depth errors

## Imports

```typescript
// Backend (convex/**/*.ts)
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// Frontend (src/**/*.ts)
import { api } from "../convex/_generated/api";
```

## [IM1d] Path Aliases: `@/` is FORBIDDEN in Convex Files

**Rule**: Never use `@/` path aliases in `convex/**/*` files. Use relative imports only.

**Why**: Convex's esbuild bundler does **not** resolve tsconfig `paths`. The `convex/tsconfig.json` has no `paths` configured, and even if added, Convex's CLI does not pass tsconfig options to esbuild. `@/` imports will pass IDE typechecking (because `tsconfig.app.json` includes convex files) but **fail at bundle time**.

```typescript
// WRONG - will fail when Convex bundles
import { something } from "@/lib/utils";

// CORRECT - relative imports work in convex/
import { something } from "../lib/utils";
```

**Enforcement**: `npm run lint:convex-imports` (runs as part of `npm run validate`). See AGENTS.md `[IM1d]`.

## Function Patterns

```typescript
// Public query
export const getChat = query({
  args: { chatId: v.id("chats") },
  returns: v.union(
    v.object({
      /* ... */
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    /* ... */
  },
});

// Internal mutation (prefix with internal*)
export const internalUpdateChat = internalMutation({
  args: {
    /* ... */
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    /* ... */
  },
});
```

## UUID v7 Implementation

Use `uuidv7` package for share IDs, public IDs, and session IDs:

```typescript
// convex/lib/uuid.ts
import { uuidv7 } from "uuidv7";

export function generateShareId(): string {
  return uuidv7();
}

export function isValidUuidV7(id: string): boolean {
  const pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return pattern.test(id);
}
```

Store as `v.string()` in schema. Existing IDs remain unchanged.

## Query Best Practices

- Use `.withIndex()` not `.filter()`
- Use `.unique()` for single documents (throws if multiple match)
- No `.delete()` support - use `.collect()` then `ctx.db.delete()`
- Default order is ascending `_creationTime`

## Schema

```typescript
// Always in convex/schema.ts
export default defineSchema({
  chats: defineTable({
    title: v.string(),
    userId: v.optional(v.id("users")),
  })
    .index("by_user", ["userId"])
    .index("by_share_id", ["shareId"]),
});
```

## TypeScript

- Use `Id<"tableName">` not `string` for document IDs
- Use `Doc<"tableName">` for full documents
- Add type hints for circular references: `const result: string = await ctx.runQuery(...)`
- Use `as const` for discriminated unions
- **Recursion Depth**: Use `@ts-ignore` with comment for "excessively deep" errors
- **Validation Architecture**: See `AGENTS.md` [VL1]. Convex `v` validators for database; Zod only at external boundaries
- **Zod Schemas**: Canonical location is `convex/schemas/`. See [TY1d] in AGENTS.md

## Pagination

```typescript
import { paginationOptsValidator } from "convex/server";

export const getPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

## Actions

- Add `"use node";` when using Node.js modules (see [CX1] in AGENTS.md)
- No database access (`ctx.db` unavailable)
- Call mutations/queries via `ctx.runMutation`/`ctx.runQuery`

## HTTP Endpoints

Use agent endpoints; legacy `/api/ai` is removed.

```typescript
// In convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    return new Response(JSON.stringify(result));
  }),
});

export default http;
```

### Agent Streaming Endpoints

- `POST /api/ai/agent` → Returns JSON `{ answer, webResearchSources, workflow }`
- `POST /api/ai/agent/stream` → SSE frames with types:
  - `workflow_start` - Initial event with workflowId and nonce for verification
  - `progress` - Stage updates (thinking, searching, scraping, generating)
  - `reasoning` - Agent thinking/planning content
  - `content` - Streaming response text deltas
  - `metadata` - Workflow metadata including `webResearchSources`
  - `complete` - Final event with full response
  - `persisted` - Persistence confirmation with signature for verification
  - `error` - Error information

## CLI Commands

```bash
npx convex dev           # Start dev server
npx convex deploy        # Deploy to production
npx convex logs          # View dev logs
npx convex logs --prod   # View production logs
npx convex dashboard     # Open dashboard
```

## Common Validators

- `v.id("tableName")` - Document ID
- `v.null()` - Null value (not undefined)
- `v.int64()` - BigInt (not v.bigint())
- `v.record(v.string(), v.any())` - Record type
- `v.union(...)` - Union types
- `v.literal("value")` - Literal values

## References

- [Convex Docs](https://docs.convex.dev)
- [Type Generation](https://docs.convex.dev/generated-api/data-model)
- [Validators](https://docs.convex.dev/functions/validation)
