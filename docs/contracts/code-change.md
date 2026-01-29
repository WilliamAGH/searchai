---
title: "Code change policy contract"
usage: "Use whenever creating/modifying files: where to put code, when to create new components, and how to stay SRP compliant"
description: "Evergreen contract for change decisions (new file vs edit), repository structure, and component hierarchy; references rule IDs in `AGENTS.md`"
---

# Code Change Policy Contract

See `AGENTS.md` ([LOC1a-d], [MO1a-g], [FS1a-e]).

## Non-negotiables (applies to every change)

- **SRP only**: each new component/hook/utility has one reason to change ([MO1d]).
- **New feature → new file**; do not grow monoliths ([MO1b]).
- **No edits to >350 LOC files**; first split/retrofit ([LOC1c]).
- **Facade & Module Pattern**: Backend features MUST use the `feature.ts` (facade) + `feature/` (module) pattern ([MO1e]).
- **Convex Actions vs Queries**: Queries read; Actions write/fetch external; Node Actions use `"use node";`.
- **Node Runtime**: `internalAction` and `action` can run in Node files (`"use node";`). Queries and mutations CANNOT.
- **Runtime Boundaries**: V8 files (default) must NEVER import Node files. Node files can import shared code (validators/schemas) but not V8-only code.
- **No DTOs**: Convex schemas define the data; Zod defines external contracts.

## Decision matrix: create new file vs edit existing

Use this as a hard rule, not a suggestion.

| Situation                            | MUST do                                                            | MUST NOT do                                             |
| :----------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------ |
| **New user-facing behavior**         | Add a new, narrowly scoped component/file ([MO1b])                 | “Just add a prop” to a giant component ([MO1a])         |
| **New Backend Feature**              | Create `convex/feature.ts` (Facade) and `convex/feature/` (Module) | Add to generic `utils.ts` or existing large files       |
| **Bug fix**                          | Edit the smallest correct owner; add tests to lock behavior        | Create a parallel/shadow implementation                 |
| **Logic change in stable code**      | Extract/replace via composition; keep stable code stable ([MO1g])  | Add flags, shims, or “compat” paths to hide uncertainty |
| **Touching a large/overloaded file** | Extract at least one seam (new hook/sub-component) ([FS1b])        | Grow the file further ([MO1a])                          |
| **Reuse needed across features**     | Add a domain-specific hook or service with intent-revealing name   | Add `*Utils/*Helper/*Common` grab bags                  |

### When adding a prop/method is allowed

Adding to an existing component/hook is allowed only when all are true:

- It is the **same responsibility** as the existing purpose ([MO1d]).
- The inputs belong together (avoid prop drilling/data clumps).

If any bullet fails, create a new component/hook.

## Create-new-file checklist (before you write code)

1. **Scout & Verify**: Use `context7`/`perplexity` for docs and check `node_modules/` to prove your API assumptions are true ([ZA1a]).
2. **Search/reuse first**: confirm a pattern doesn’t already exist ([FS1a]).
3. **Pick the correct layer** (convex → app → components → lib).
4. **Adhere to Facade Pattern**: For backend, ensure you are creating/updating the module, not just stuffing the facade.
5. **Check Runtime**: If creating a Node action (`"use node";`), verify you are NOT importing any V8-only files (queries/mutations) directly.
6. **Name by role** (ban generic names; suffix declares meaning like `*Card`, `*List`).
7. **Keep the file small** (stay comfortably under 350 LOC; split by concept early) ([LOC1a]).
8. **Verify** with repo-standard commands (`npm run lint`, `npm run typecheck`).

## Repository Map & Structure (Strict Enforcement)

The repository follows a **Facade & Module** pattern for the backend (`convex/`) and a **Feature-First** architecture for the frontend (`src/`).

### Convex Backend Structure (`convex/`)

**Pattern:** Facade & Module ([MO1d], [LOC1b])
Every feature (e.g., `chats`) has a **Public Facade** file and a **Private Module** directory.

```text
convex/
├── schema.ts                # Central Database Schema (Single Source of Truth)
├── auth.ts                  # Facade
├── chats.ts                 # FACADE: Public API (exports only what frontend needs)
├── chats/                   # MODULE: Domain Logic (Hidden implementation)
│   ├── core.ts              #    - CRUD primitives
│   ├── permissions.ts       #    - Auth & Policy rules
│   ├── actions.ts           #    - Node.js actions ("use node";)
│   └── utils.ts             #    - Internal helpers (not exported by facade)
├── lib/                     # SHARED KERNEL: Stateless utilities only
│   ├── schemas/             #    - Zod schemas for external APIs (OpenAI, Stripe)
│   ├── validation/          #    - Validation helpers
│   └── utils.ts             #    - Generic helpers (date, math)
└── _generated/              # Convex auto-generated code
```

### Frontend Structure (`src/`)

**Pattern:** Feature-First / Colocation
Code related to a feature stays together.

```text
src/
├── components/
│   ├── chat/                # FEATURE: Chat UI
│   │   ├── ChatContainer.tsx
│   │   ├── MessageBubble.tsx
│   │   └── chat-types.ts    #    - UI-specific types/props
│   └── ui/                  # SHARED: Generic Design System (Buttons, Inputs)
├── hooks/
│   ├── useChat.ts           # Domain hooks
│   └── use-toast.ts         # Generic hooks
└── lib/                     # Shared frontend utilities
```

### Type & Schema Locations

| Artifact           | Location                     | Responsibility                                      |
| :----------------- | :--------------------------- | :-------------------------------------------------- |
| **DB Schema**      | `convex/schema.ts`           | Defines database shape. Source of truth for Convex. |
| **Domain Schemas** | `convex/schemas/[domain].ts` | Zod schemas + inferred types for entities (DTOs).   |
| **Props/UI Types** | In-file (`.tsx`)             | Component props and frontend-only state shapes.     |

### [DM1] Data Model Contract

- **Core Data**: Defined **exclusively** in `convex/schemas/[domain].ts` as Zod schemas. Export inferred types.
- **UI Props**: Defined **exclusively** inside the component file (`interface Props { ... }`). No external type files for props.
- **No Barrels**: `src/types/` and `src/**/types.ts` are **PROHIBITED** for domain data. Use the canonical schema.
- **Strictness**: No manual interface duplication. If it's a shared entity, it must be a Zod schema.

### Naming conventions

- Components: `PascalCase` (`UserCard.tsx`)
- Hooks: `camelCase` starting with use (`useUser.ts`)
- Utilities/Services: `kebab-case` (`user-service.ts`)
- Convex Functions: `camelCase` (`sendMessage.ts`)

## Test Structure (`__tests__/`)

**Pattern:** Mirrored top-level structure matching the project layout.

```text
__tests__/
├── setup.ts                    # Global test setup (Vitest)
├── config/                     # Shared test configuration
│   └── viewports.ts            #   - Viewport definitions for Playwright
├── convex/                     # Tests for convex/ code (mirrors convex/)
│   ├── agents/                 #   - Agent tests
│   │   ├── __mocks__/          #     - Mocks for agent dependencies
│   │   └── *.test.ts           #     - Agent test files
│   ├── chats/                  #   - Chat domain tests
│   └── lib/                    #   - Utility tests
├── src/                        # Tests for src/ code (mirrors src/)
│   ├── hooks/                  #   - Hook tests
│   │   └── *.test.tsx          #     - React hook test files
│   └── lib/                    #   - Frontend utility tests
├── e2e/                        # Playwright end-to-end tests
│   └── *.spec.ts               #   - E2E test specs
└── integration/                # Integration tests
    └── *.spec.ts               #   - Integration test specs
```

### Conventions

- **Mirrored paths**: Test file location mirrors source location (e.g., `convex/lib/url.ts` → `__tests__/convex/lib/url.test.ts`)
- **`__mocks__/` location**: Mocks live alongside tests they support (e.g., `__tests__/convex/agents/__mocks__/`)
- **File naming**: Unit tests use `.test.ts(x)`, E2E/integration use `.spec.ts`
- **Environment**: React component/hook tests require `// @vitest-environment jsdom` directive

## Verification gates (do not skip)

- LOC enforcement: `npm run lint:loc` ([LOC1d]).
- Validation: `npm run validate`.

## Type Safety & Zod Validation Standards

Core rules in `AGENTS.md`: [TY1], [VL1], [ZV1]

### [TS1] Strict Type Safety

- [TS1a] `noImplicitAny` enabled. Explicit `any` **FORBIDDEN** except Convex recursion limits.
- [TS1b] `unknown` only at boundaries; validate immediately, never propagate.
- [TS1c] Convex "excessively deep" errors: use `@ts-ignore` with comment, not global disables.

### [ZD1] Zod Version

- [ZD1a] Import `zod/v4` everywhere.
- [ZD1b] Exception: `convex/agents/tools.ts` uses `zod` v3 for OpenAI Agents SDK tool params.
- [ZD1c] v3 schemas must not cross integration boundary.

### [ZD2] Schema Location — Per [VL1]

- [ZD2a] **Canonical Zod schemas**: `convex/schemas/` (importable by both `src/` and `convex/`)
- [ZD2b] **Convex validators**: `convex/lib/validators.ts` (required for database, cannot use Zod)
- [ZD2c] **No duplication**: Import from canonical location. Never redefine same schema.
- [ZD2d] **Validation utilities**: `convex/lib/validation/zodUtils.ts` — canonical location for `logZodFailure`, `safeParseWithLog`, `safeParseOrNull`, `parseArrayWithLogging`, `ValidationResult<T>`, and `isRecord`.

### [ZD3] When to Validate

| Data Source                      | Validation          | Why                         |
| -------------------------------- | ------------------- | --------------------------- |
| External API (SerpAPI, scrapers) | Zod `.safeParse()`  | Untrusted                   |
| Convex query/mutation result     | **None**            | Already validated by Convex |
| Tool call output (OpenAI SDK)    | Zod `.safeParse()`  | JSON parsing boundary       |
| User form input                  | Zod or form library | Untrusted                   |

### [ZD4] Best Practices

- Use `.safeParse()` on untrusted data (never `.parse()` on network payloads).
- Derive types via `z.infer<typeof Schema>`.

### [ZD5] Error Handling — Per [ZV1]

- [ZD5a] **Never swallow errors**: Use `logZodFailure(context, error, payload)` for all validation failures.
- [ZD5b] **Include record identifiers**: Context must identify WHICH record failed (e.g., `"parseUser [id=abc123]"`).
- [ZD5c] **Discriminated unions**: Return `{ success: true, data }` or `{ success: false, error }`, not `null`.
- [ZD5d] **Use canonical utilities**:

```typescript
import { logZodFailure, safeParseWithLog, safeParseOrNull } from "convex/lib/validation/zodUtils";

// Best: Discriminated union (new code)
const result = safeParseWithLog(UserSchema, data, `parseUser [id=${id}]`);
if (result.success) {
  // result.data is typed
} else {
  // result.error is ZodError (already logged)
}

// Legacy compatibility: Returns null (logs on failure)
const user = safeParseOrNull(UserSchema, data, `parseUser [id=${id}]`);
```

### [ZD6] Forbidden Patterns

```typescript
// FORBIDDEN: parse() throws and crashes rendering
const data = schema.parse(raw);

// FORBIDDEN: silent fallback swallows errors
const data = schema.safeParse(raw).data ?? defaultValue;

// FORBIDDEN: empty catch hides failures
try {
  schema.parse(raw);
} catch {
  return null;
}

// FORBIDDEN: no record identifier - can't debug
logZodFailure("parseResponse", error, raw); // Which record??
```
