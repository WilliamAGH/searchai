---
description: "AI-powered search application with Convex backend and React frontend, following strict type safety and modern development practices."
alwaysApply: true
---

# SearchAI.io Development Configuration

**ZERO TEMPERATURE development: Every decision must be verified through live documentation. No assumptions permitted. Type safety is absolute.**

---

## 🚨 PART 1: CRITICAL PROHIBITIONS & VERIFICATION

### Mandatory Verification Protocol

**BEFORE ANY CODE CHANGE:**

1. Verify current versions: `cat package.json | grep -E '"(react|convex|vite|typescript)"'`
2. Search live documentation: "[library] [version] documentation"
3. Verify API patterns in official docs
4. Never trust training data or memory

**ABSOLUTELY FORBIDDEN:**

- Using remembered API patterns from training data
- Assuming library behavior without checking current docs
- Writing code based on "common patterns" without verification
- Guessing at configuration options
- Using deprecated or outdated syntax
- React class components, useEffect for data fetching, deprecated React 18 patterns

**Assumptions = VIOLATIONS. Training data is outdated. Memory is unreliable. Only live documentation is truth.**

### Type Safety Violations - IMMEDIATE HALT

**NEVER ALLOWED:**

- Any `@ts-ignore` or `@ts-expect-error` EXCEPT for documented Convex TS2589 issues
- Any `eslint-disable` comments
- Any `any` type without explicit justification
- Any unvalidated external data
- Any type assertions without runtime checks

### 🚨 CRITICAL: Destructive Git Operations - ABSOLUTE PROHIBITIONS

**NEVER ALLOWED UNDER ANY CIRCUMSTANCES:**

- ❌ `git stash` / `git stash push` / `git stash pop`
- ❌ `git reset --hard`
- ❌ `git clean -f` / `git clean -fd`
- ❌ `git checkout -- .` (destructive restore)
- ❌ `git push --force` / `git push -f`
- ❌ Deleting branches
- ❌ Amending commits that aren't the most recent
- ❌ Any operation that discards uncommitted changes or rewrites history

**NEVER ASSUME uncommitted changes are "mistakes"** - they may be active work, testing, or other intentional modifications.

**What IS Allowed:**

- ✅ `git status`, `git diff`, `git log`, `git show`, `git branch` (view only)
- ✅ `git add <files>`, `git commit -m "message"` (after user approval)
- ✅ Ask the user what they want to do with uncommitted changes

**When pre-commit hooks fail:**

- ✅ STOP and report errors to user
- ❌ NEVER stash changes to bypass hooks
- ❌ NEVER use `--no-verify` without explicit user approval

**VIOLATION CONSEQUENCES:** Discarding user's work is UNACCEPTABLE. When in doubt, ASK.

### Documentation Source of Truth

- **Single Source:** `.cursor/rules/*.mdc` is authoritative for engineering guidelines
- **Canonical Files:**
  - Testing: `.cursor/rules/testing.mdc`
  - Convex: `.cursor/rules/convex_rules.mdc`
  - Pagination: `.cursor/rules/pagination.mdc`
  - Chat Domain: `.cursor/rules/chat.mdc`
  - Migrations: `.cursor/rules/migrations-uuid.mdc`
- **Never duplicate** between `docs/` and `.cursor/rules/`

---

## 🎯 PART 2: TYPE SAFETY & CONVEX ARCHITECTURE

### Convex Type Import Rules

**CORE PRINCIPLE:** Convex's `_generated` directory IS the abstraction layer. Never create wrappers.

**ALWAYS:**

- Import directly from `convex/_generated/` (backend) or `../../convex/_generated/` (frontend)
- Use generated `Doc<TableName>`, `Id<TableName>`, `api`, `internal` types

**NEVER:**

- Create "wrapper" or "re-export" files like `convexTypes.ts`
- Manually duplicate types that Convex generates
- Re-export types from intermediate files

```typescript
// ✅ CORRECT
import { query, mutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// ❌ WRONG
import { Doc, Id } from "./lib/convexTypes"; // NO wrapper files
interface User {
  _id: string;
  name: string;
} // NO manual types
```

**Convex TS2589 Workaround:**
When `ctx.runMutation` with complex nested types causes "Type instantiation is excessively deep" errors, simplify argument types or use:

```typescript
// @ts-ignore - Known Convex limitation with complex type inference
await ctx.runMutation(api.chats.publishAnonymousChat, { ... });
```

### Validation Strategy

- **Convex `v` validators** handle all basic type validation (runtime + type-safe)
- **External validation ONLY for:** Regex patterns, email/URL formats, string length constraints, custom transform logic
- **NO Zod needed** for basic type validation

---

## 📁 PART 3: DIRECTORY BOUNDARIES & ORGANIZATION

### Critical Separation: Frontend vs Backend

| Directory              | Can Import From                          | CANNOT Import From                 |
| ---------------------- | ---------------------------------------- | ---------------------------------- |
| `src/`                 | `convex/_generated/`, other `src/` files | `convex/*.ts` (except \_generated) |
| `convex/`              | Other `convex/` files, Node modules      | ANY `src/` files                   |
| `src/lib/validation/`  | `src/` files only                        | `convex/` files                    |
| `convex/lib/security/` | `convex/` files only                     | `src/` files                       |

**Why:** Convex backend runs in separate environment; frontend accesses backend only through generated API types.

### Validation Placement

**Client-Side (`src/lib/validation/`):**

- ✅ Form validation for UX feedback, input length checks, format hints
- ❌ NOT for security (can be bypassed) or data normalization

**Server-Side (`convex/lib/security/`):**

- ✅ **MANDATORY** security sanitization, data normalization, HTML/XSS prevention, type coercion

### Type Definitions Placement

**Database Types:**

- ✅ **ONLY** from `convex/_generated/dataModel`
- ❌ NEVER manually define database types

**Business Logic Types:**

- Backend-only → Define in relevant `convex/` file
- Frontend-only → Define in `src/types/` (UI-specific types ONLY)
- Shared → Define in backend, import via API response types

**❌ NEVER Re-export Types** - Import directly from source of truth. Re-exports mask circular dependencies.

### File Organization Standards

**Maximum 500 lines per file** - Split when approaching 400 lines by:

- **Components:** Extract sub-components, hooks, utilities
- **Convex:** Split by domain (queries.ts, mutations.ts, subscriptions.ts)
- **Utils:** Group by feature (validation/, formatting/, constants/)

**Circular Dependency Prevention:**

- Dependency direction: `UI Components → Hooks → Services → Types`
- Import Convex types ONLY from `_generated/dataModel`
- Run `npm run typecheck` frequently
- Keep import chains shallow (max 3-4 levels)

---

## 🛠️ PART 4: DEVELOPMENT WORKFLOW

### Pre-commit Validation

**ALL changes MUST pass:**

```bash
npm run validate  # Runs: lint, typecheck, format:check, test
```

### Convex Workflow

**Adding Functions:**

1. Create function in `convex/` directory
2. Deploy to dev: `npx convex dev --once`
3. Test thoroughly
4. Deploy to prod: `npx convex deploy -y`

**Environment Switching:**

```bash
# Dev
export CONVEX_DEPLOYMENT=diligent-greyhound-240
npx convex dev

# Prod
export CONVEX_DEPLOYMENT=vivid-boar-858
npx convex deploy -y
```

**Debugging:**

```bash
npx convex logs --filter "functionName"  # Check logs
npx convex logs --follow                  # Real-time logs
npx convex dashboard                      # Open dashboard
```

**See [README.md](./README.md) for complete Convex setup and troubleshooting.**

### Commit Conventions

```
feat:     New features
fix:      Bug fixes
refactor: Code restructuring
test:     Test updates
docs:     Documentation
style:    Formatting changes
chore:    Maintenance
perf:     Performance improvements
```

---

## 📋 PART 5: PROJECT CONFIGURATION REFERENCE

### Stack & Versions

```yaml
FRAMEWORK: React 19.x
RUNTIME: Node.js 22 LTS
TYPESCRIPT_VERSION: 5.9.x
BUILD_TOOL: Vite 6.x
BACKEND: Convex
TEST_RUNNER: Playwright
LINTER: Oxlint v1.x
FORMATTER: Prettier
```

### Repository & Deployments

```yaml
REPO_NAME: searchai-io
GITHUB_URL: https://github.com/williamagh/searchai-io
DEFAULT_BRANCH: dev
PACKAGE_MANAGER: npm

# Convex
CONVEX_DEV_DEPLOYMENT: diligent-greyhound-240
CONVEX_DEV_URL: https://diligent-greyhound-240.convex.cloud
CONVEX_PROD_DEPLOYMENT: vivid-boar-858
CONVEX_PROD_URL: https://vivid-boar-858.convex.cloud

# URLs
PRODUCTION_URL: https://search-ai.io
DEVELOPMENT_URL: https://dev.search-ai.io
LOCAL_DEVELOPMENT_URL: http://localhost:5173
```

### Key Commands

```bash
# Development
npm run dev              # Start frontend + backend
npm run dev:frontend     # Frontend only (Vite)
npm run dev:backend      # Backend only (Convex)

# Convex
npx convex dev          # Start dev with hot reload
npx convex dev --once   # Deploy to dev without watching
npx convex deploy       # Deploy to production
npx convex logs         # View dev logs
npx convex logs --prod  # View prod logs
npx convex dashboard    # Open dashboard

# Environment
npx convex env set KEY "value"       # Set dev env var
npx convex env set KEY "value" --prod # Set prod env var
npx convex env list                   # List dev env vars
npx convex env list --prod            # List prod env vars

# Quality
npm run validate         # Run all validations
npm run lint            # Run Oxlint
npm run lint:fix        # Fix linting issues
npm run typecheck       # TypeScript validation
npm run format          # Format with Prettier

# Testing
npm run test            # Run all tests
npm run test:smoke      # Smoke tests only
npm run test:coverage   # With coverage
npm run test:watch      # Watch mode

# Build
npm run build           # Production build
npm run preview         # Preview production build
npm run clean           # Clear caches
npm run clean:all       # Full reset
```

### Environment Variables

**Key variables (see [README.md](./README.md#environment-variables-reference) for complete list):**

```yaml
# Frontend (CRITICAL: Use import.meta.env.VITE_*, NOT process.env)
VITE_CONVEX_URL: Frontend build-time Convex URL

# Backend
CONVEX_DEPLOYMENT: CLI deployment target
CONVEX_RESEND_API_KEY: Email service (Resend)
OPENROUTER_API_KEY: AI provider
SERP_API_KEY: Search API
# NEVER commit .env files
```

### Directory Structure

```
searchai-io/
├── src/                # Frontend (React)
│   ├── components/     # React components
│   ├── hooks/         # Custom hooks
│   ├── lib/           # Frontend utilities
│   │   ├── validation/ # Client-side validation (UX only)
│   │   ├── utils/     # Helpers
│   │   └── adapters/  # Service adapters
│   ├── types/         # UI-only types (NEVER database entities)
│   └── styles/        # CSS/styling
├── convex/            # Backend (Convex)
│   ├── _generated/    # Auto-generated types (SOURCE OF TRUTH)
│   ├── lib/           # Backend utilities
│   │   └── security/  # Server-side validation & sanitization
│   ├── http/          # HTTP route handlers
│   │   └── routes/    # Individual route modules
│   └── *.ts          # Backend functions
├── tests/             # Test files
└── public/            # Static assets
```

### Additional Technical Details

**Modern Stack:**

- React 19, Vite 6, Convex, Tailwind CSS
- AI SDK: OpenAI SDK (completions) + Vercel AI SDK (streaming)
- Email: Resend (`CONVEX_RESEND_API_KEY`, templates in `convex/email.ts`)

**Security:**

- Rate limiting, input sanitization, CORS, authentication for mutations

**Styling:**

- Tailwind CSS, component-specific styles, responsive design, dark mode, accessibility-first

**Quality:**

- Zero warnings/errors, comprehensive test coverage, consistent formatting, max 500 lines per file

---

**REMEMBER:** This is a ZERO TEMPERATURE environment. Verify EVERYTHING against current documentation. No assumptions.
