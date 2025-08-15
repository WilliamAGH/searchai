---
description: "AI-powered search application with Convex backend and React frontend, following strict type safety and modern development practices."
alwaysApply: true
---

# SearchAI.io Development Configuration

## 📌 PROJECT CONFIGURATION

```yaml
# Repository
REPO_NAME: searchai-io
GITHUB_URL: https://github.com/williamagh/searchai-io
GITHUB_ORG: WilliamAGH
DEFAULT_BRANCH: dev

# Package Manager
PACKAGE_MANAGER: npm
PACKAGE_MANAGER_LOCK: package-lock.json
PACKAGE_MANAGER_RUN: npm run
PACKAGE_MANAGER_INSTALL: npm install
PACKAGE_MANAGER_ADD: npm install
PACKAGE_MANAGER_REMOVE: npm uninstall

# Convex Deployments (see README.md for detailed setup)
CONVEX_DEV_DEPLOYMENT: diligent-greyhound-240
CONVEX_DEV_URL: https://diligent-greyhound-240.convex.cloud
CONVEX_PROD_DEPLOYMENT: vivid-boar-858
CONVEX_PROD_URL: https://vivid-boar-858.convex.cloud

# Commands
BUILD_COMMAND: npm run build
DEV_COMMAND: npm run dev
TEST_COMMAND: npm run test
LINT_COMMAND: npm run lint
FORMAT_COMMAND: npm run format
VALIDATE_COMMAND: npm run validate
TYPE_CHECK_COMMAND: npm run typecheck

# Stack
FRAMEWORK: React
FRAMEWORK_VERSION: 19.x
RUNTIME: Node.js
RUNTIME_VERSION: 22 LTS
TYPESCRIPT_VERSION: 5.9.x
REACT_VERSION: 19.1.x
BUILD_TOOL: Vite
BUILD_TOOL_VERSION: 6.x
BACKEND: Convex

# Testing
TEST_RUNNER: Playwright
TEST_FRAMEWORK: Playwright Test
TEST_CONFIG_PATH: playwright.config.ts
TEST_FILE_PATTERN: **/*.{test,spec}.{ts,tsx,js,jsx}
TEST_COVERAGE_COMMAND: npm run test:coverage
TEST_WATCH_COMMAND: npm run test:watch
TEST_SMOKE_COMMAND: npm run test:smoke
TEST_UNIT_COMMAND: npm run test:unit
TEST_E2E_COMMAND: npm run test:e2e
TEST_ENV: node
TEST_TIMEOUT: 30000
MOCK_LIBRARY: built-in
ASSERTION_LIBRARY: expect

# Code Quality
LINTER: Oxlint v1.x
FORMATTER: Prettier
TYPE_CHECKER: TypeScript (tsc)

# Validation Strategy
# - Convex v validators for schema & function args (type-safe, runtime-validated)
# - Built-in validators: v.string(), v.number(), v.object(), v.array(), etc.
# - Runtime validation automatic for all Convex functions
# - Custom validation in handlers for business rules (email format, ranges, etc.)
# - NO Zod needed for basic type validation (Convex handles this)
# - Consider external validation ONLY for patterns Convex doesn't support:
#   * Regex patterns, email/URL formats
#   * String length constraints, number ranges
#   * Custom transform/refine logic

# Directories
TYPES_DIR: src/types/          # UI-only types, NEVER database entities
SCHEMAS_DIR: src/schemas/
DOCS_DIR: docs/
COMPONENTS_DIR: src/components/
STYLES_DIR: src/styles/
PUBLIC_DIR: public/
CONFIG_DIR: ./
CONVEX_DIR: convex/

# CI/CD & Deployment
CI_PROVIDER: GitHub Actions
DEPLOYMENT_PLATFORM: Self-hosted Docker Containers (using Coolify and otherwise)
PRODUCTION_URL: https://search-ai.io
DEVELOPMENT_URL: https://dev.search-ai.io
LOCAL_DEVELOPMENT_URL: http://localhost:5173

# Email Service
EMAIL_PROVIDER: Resend
EMAIL_ENV_KEY: CONVEX_RESEND_API_KEY
```

This project operates under **ZERO TEMPERATURE** development standards where every decision must be explicitly verified through live documentation, no assumptions are permitted, and type safety is absolute.

## 🔥 ZERO_TEMPERATURE RULE: Always Use Existing Code

### The Cardinal Rule of Code Reuse

**CRITICAL MANDATE:** When looking for bugs, issues, fixes, code improvements, refactors, or new features, we ALWAYS look for existing code first and make changes with the least intervention necessary. We only rebuild from scratch when it would constitute a substantial improvement.

### Our Biggest Enemy: Code Redundancy

**THE PROBLEM:**

- Redundant code exists in multiple places
- Some code references it in one place, some in another
- This makes fixing things an enormous battle
- A single bug fix requires changes in multiple locations
- Features break because not all instances were updated
- Maintenance becomes exponentially harder over time

### The ZERO_TEMPERATURE Solution

**MANDATORY WORKFLOW:**

1. **ALWAYS Search First**:

   - Before writing ANY new code, search for existing implementations
   - Use grep/find to locate similar functionality
   - Check if the pattern already exists in the codebase
   - Look for utilities, helpers, or shared components that could be reused

2. **Immediate Redundancy Response**:

   - The moment redundant code is observed → STOP
   - Create an immediate TODO to fix and de-duplicate it
   - Document where the redundancy exists
   - If not fixed immediately, the issue WILL persist and multiply

3. **Minimal Intervention Principle**:
   - Make the smallest change necessary to fix the issue
   - Extend existing code rather than replacing it
   - Add parameters to existing functions rather than creating new ones
   - Use composition over duplication

### Practical Examples

**❌ WRONG - Creating New Code:**

```typescript
// Found a bug in chat validation
// Writing a new validation function from scratch
export function validateChatMessage(message: string) {
  // New implementation
}
```

**✅ CORRECT - Finding and Fixing Existing Code:**

```typescript
// Step 1: Search for existing validation
// grep -r "validate.*message" --include="*.ts"
// Found: convex/lib/security/validation.ts has validateMessage()

// Step 2: Fix the existing function
// Extend it if needed, but don't duplicate
```

### Redundancy Detection Checklist

**BEFORE ANY CODE CHANGE, ASK:**

- [ ] Have I searched for existing implementations?
- [ ] Am I about to duplicate functionality that exists elsewhere?
- [ ] Could I extend an existing function instead of creating a new one?
- [ ] Is there a shared utility that handles this pattern?
- [ ] Have I checked both frontend (`src/`) and backend (`convex/`) for similar code?

### When You Find Redundancy

**IMMEDIATE ACTIONS:**

1. **Document It**:

   ```typescript
   // TODO: REDUNDANCY ALERT - De-duplicate this function
   // Duplicate found in:
   // - src/lib/validation/chat.ts
   // - convex/lib/security/chatValidation.ts
   // Should be consolidated into single source of truth
   ```

2. **Create a Task**:

   - Add to immediate TODO list
   - Mark as HIGH PRIORITY
   - Fix before continuing with feature work

3. **Consolidate to Single Source**:
   - Choose the most appropriate location
   - Migrate all usages to the single source
   - Delete redundant implementations
   - Update all imports

### The Cost of Ignoring This Rule

**GUARANTEED CONSEQUENCES:**

- Bug fixes only work in some places
- Features behave inconsistently
- Code becomes increasingly difficult to maintain
- Simple changes require hunting through multiple files
- Technical debt compounds exponentially
- New developers can't understand which version to use

### ZERO_TEMPERATURE Mindset

**REMEMBER:**

- You're ALWAYS improving existing code, not writing new code
- The repository already has most of what you need
- Your job is to find it, fix it, and reuse it
- Every line of new code should be questioned: "Does this already exist?"
- Redundancy prevention is not optional - it's mandatory

**THE RULE:** Use existing code. Find it in the repo, don't start from scratch. Zero temperature means zero tolerance for redundancy.

## 🔄 CRITICAL: Comprehensive Code Update Protocol

### The Update Verification Mandate

**ABSOLUTE REQUIREMENT:** When editing or updating ANY code, you MUST find and update ALL usages throughout the entire codebase. Missing even one usage creates inconsistencies that break features and introduce bugs.

### Three-Phase Update Protocol

#### Phase 1: Pre-Update Planning

**BEFORE making any code changes:**

1. **Map All Usages**:

   ```bash
   # Find all imports of the module/function
   grep -r "import.*ModuleName" --include="*.ts" --include="*.tsx"

   # Find all function calls
   grep -r "functionName(" --include="*.ts" --include="*.tsx"

   # Find all type references
   grep -r "TypeName" --include="*.ts" --include="*.tsx"
   ```

2. **Create Update Checklist**:

   ```typescript
   // TODO: Update Plan for [Function/Type/Module Name]
   // [ ] src/components/Chat/ChatInput.tsx - line 45
   // [ ] src/hooks/useChat.ts - line 78, 92
   // [ ] convex/chats.ts - line 234
   // [ ] convex/http/routes/chat.ts - line 56
   // [ ] tests/chat.test.ts - line 123, 145
   ```

3. **Identify Wire Points**:
   - What files will need to import this?
   - What files currently use the old pattern?
   - What new connections need to be established?
   - What parameter changes ripple through the codebase?

#### Phase 2: During Updates

**WHILE making changes:**

1. **Track Every Change**:

   ```typescript
   // CHANGE LOG:
   // ✓ Updated function signature in convex/lib/security/validation.ts
   // ✓ Updated import in src/components/ChatMessage.tsx
   // ✓ Updated call site in src/hooks/useMessages.ts
   // ⚠️ PENDING: Update tests in tests/validation.test.ts
   ```

2. **Verify Parameter Agreement**:

   - Function signatures match across all calls
   - Type parameters align everywhere
   - Import paths are consistent
   - No orphaned old implementations

3. **Check Adjacent Functionality**:
   - Related functions that might use similar patterns
   - Parent components that pass props
   - Child components that receive data
   - Middleware or interceptors in the chain

#### Phase 3: Post-Update Audit

**AFTER completing updates:**

1. **Comprehensive Usage Audit**:

   ```bash
   # Verify no old patterns remain
   grep -r "oldFunctionName" --include="*.ts" --include="*.tsx"

   # Check for type mismatches
   npm run typecheck

   # Verify all imports resolve
   npm run build
   ```

2. **Expanded Search for Missed Updates**:

   - Search for partial matches (might catch variations)
   - Check test files for mock implementations
   - Review configuration files
   - Scan documentation and comments

3. **Adjacent Functionality Verification**:
   - Functions in the same module
   - Similar patterns in other domains
   - Event handlers and callbacks
   - Error handling paths

### Common Update Failures to Prevent

**❌ CRITICAL FAILURES:**

1. **Parameter Mismatch**:

   ```typescript
   // Function updated to take 3 parameters
   function processChat(id: string, message: string, userId: string) {}

   // But some calls still use 2 parameters
   processChat(id, message); // 💥 Runtime error!
   ```

2. **Type Definition Drift**:

   ```typescript
   // Type updated in one place
   type ChatMessage = { id: string; content: string; timestamp: number };

   // But old type still used elsewhere
   type ChatMessage = { id: string; text: string }; // 💥 Type mismatch!
   ```

3. **Import Path Inconsistency**:

   ```typescript
   // Some files use new path
   import { validate } from "@/lib/validation/chat";

   // Others still use old path
   import { validate } from "../../../utils/validate"; // 💥 Module not found!
   ```

### The Update Verification Checklist

**FOR EVERY CODE UPDATE:**

- [ ] Created comprehensive list of ALL current usages
- [ ] Mapped out ALL files that will need updates
- [ ] Identified ALL parameter changes needed
- [ ] Updated EVERY import statement
- [ ] Modified EVERY function call
- [ ] Adjusted EVERY type reference
- [ ] Checked ALL test files
- [ ] Verified NO old patterns remain
- [ ] Confirmed ALL parameters match
- [ ] Validated ALL types align
- [ ] Tested ALL affected functionality
- [ ] Reviewed ALL adjacent code

### Search Strategies for Finding All Usages

```bash
# 1. Direct function/type usage
grep -r "functionName" --include="*.ts" --include="*.tsx"

# 2. Import statements
grep -r "import.*functionName" --include="*.ts" --include="*.tsx"
grep -r "from.*moduleName" --include="*.ts" --include="*.tsx"

# 3. Destructured imports
grep -r "{.*functionName.*}" --include="*.ts" --include="*.tsx"

# 4. Dynamic references
grep -r "['\"]\.functionName" --include="*.ts" --include="*.tsx"

# 5. Test mocks and stubs
grep -r "mock.*functionName" --include="*.test.ts" --include="*.spec.ts"
grep -r "jest\.fn.*functionName" --include="*.test.ts"

# 6. Configuration references
grep -r "functionName" --include="*.json" --include="*.config.ts"

# 7. Comments and documentation
grep -r "functionName" --include="*.md" --include="*.ts" --include="*.tsx"
```

### Zero Tolerance for Incomplete Updates

**THE CONSEQUENCES:**

- Partial updates = Broken features
- Missed usages = Runtime errors
- Inconsistent parameters = Type errors
- Forgotten imports = Build failures

**THE SOLUTION:**

- Plan comprehensively
- Update systematically
- Verify exhaustively
- Never assume completeness

**FINAL RULE:** An update is not complete until EVERY usage has been found, updated, and verified. Zero temperature means zero tolerance for incomplete updates.

## 📚 DOCUMENTATION HIERARCHY

**Authoritative Sources:**

- `.cursor/rules/*.mdc` - Engineering guidelines (single source of truth)
  - `testing.mdc` - Vitest/Playwright setup
  - `convex_rules.mdc` - Validated Convex patterns
  - `pagination.mdc` - Pagination architecture
  - `chat.mdc` - Chat domain architecture
- `README.md` - Setup, deployment, environment configuration
- `docs/` - Historical/transient materials only (migrate to .mdc if canonical)

## 🚨 VERIFICATION PROTOCOL

### Documentation Verification

**NEVER** use training data or assumptions. **ALWAYS** verify against live documentation.

**Required for EVERY code change:**

1. Web search for "[library] [version] documentation"
2. Verify exact API in official docs
3. Check package.json for actual versions
4. Validate with `npm run validate` before committing

**Forbidden:**

- **ANY `@ts-ignore` comments - NO EXCEPTIONS**
- **ANY `@ts-expect-error` comments - NO EXCEPTIONS**
- **ANY `eslint-disable` comments - NO EXCEPTIONS**
- Any `any` type without proper type narrowing
- Assumptions about API behavior

### TypeScript TS2589 Prevention

**NEVER use `@ts-ignore` - even for TS2589 errors. Fix them properly:**

```typescript
// ❌ FORBIDDEN - Never use @ts-ignore
// @ts-ignore - Known Convex limitation
await ctx.runMutation(api.chats.publish, { ... });

// ✅ CORRECT - Refactor to avoid deep type instantiation
// Option 1: Simplify the type structure
const simpleMessages = messages.map(m => ({ role: m.role, content: m.content }));
await ctx.runMutation(api.chats.publish, { messages: simpleMessages });

// Option 2: Use helper functions to break up complex operations
async function publishMessages(ctx: MutationCtx, messages: Message[]) {
  // Helper function with simpler types
}

// Option 3: Increase TypeScript recursion limit in tsconfig.json
// "compilerOptions": { "typeInstantiationDepth": 200 }
```

## 🏗️ PROJECT STRUCTURE & BOUNDARIES

```text
searchai-io/
├── src/                       # FRONTEND ONLY - React application
│   ├── components/           # React components
│   ├── hooks/               # Custom React hooks
│   ├── lib/
│   │   ├── validation/      # CLIENT-SIDE validation (UX feedback only)
│   │   ├── utils/          # Frontend helpers
│   │   └── adapters/       # Frontend service adapters
│   └── types/              # UI-only types (NEVER database entities!)
├── convex/                    # BACKEND ONLY - Convex functions
│   ├── _generated/          # AUTO-GENERATED types (SOURCE OF TRUTH)
│   ├── lib/
│   │   └── security/       # SERVER-SIDE validation & sanitization
│   │       ├── sanitization.ts  # Input sanitization, SearchResult normalization
│   │       ├── patterns.ts      # Security patterns
│   │       └── webContent.ts    # Web content security
│   ├── http/               # HTTP route handlers
│   │   └── routes/         # Individual route modules
│   └── *.ts               # Backend functions
└── tests/                     # Test files
```

**Critical Import Rules:**

| Directory              | Can Import From                    | CANNOT Import From                 |
| ---------------------- | ---------------------------------- | ---------------------------------- |
| `src/`                 | `convex/_generated/`, other `src/` | `convex/*.ts` (except \_generated) |
| `convex/`              | Other `convex/`, Node modules      | ANY `src/` files                   |
| `src/lib/validation/`  | `src/` only                        | `convex/` files                    |
| `convex/lib/security/` | `convex/` only                     | `src/` files                       |

## 🎯 CONVEX TYPE SYSTEM

**ONE RULE:** Import ALL database types from `convex/_generated/` - NO EXCEPTIONS.

### Correct Patterns

```typescript
// ✅ BACKEND (convex/ directory)
import { query, mutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// ✅ FRONTEND (src/ directory)
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

// Using types
const userId: Id<"users"> = "...";
const user: Doc<"users"> = await ctx.db.get(userId);
```

### Forbidden Patterns

```typescript
// ❌ Re-export files
export { Doc, Id } from "../_generated/dataModel";

// ❌ Manual type definitions for DB entities
interface User { _id: string; name: string; }

// ❌ Duplicate schema types
type ChatMessage = { ... }  // Use Doc<"messages"> instead
```

**Why:** Convex's `_generated/` directory IS the abstraction layer. Re-exports cause circular dependencies, break IDE discovery, and add maintenance burden.

### Validation Strategy

- **Client-side (`src/lib/validation/`):** UX feedback only (can be bypassed)
- **Server-side (`convex/lib/security/`):** MANDATORY security & normalization
- **Convex validators:** Use `v` validators for all function arguments

## 📏 CODE ORGANIZATION

### File Size Limit: 500 Lines Maximum

Split files approaching 400 lines:

- Components → Separate header/body/footer
- Logic → Extract hooks
- Utilities → Group by domain
- Convex → Split by queries/mutations

### Circular Dependency Prevention

1. **Import Direction:** UI → Hooks → Services → Types (never reverse)
2. **Type Imports:** Only from `_generated/dataModel`
3. **No Re-exports:** Import directly from source
4. **Validation:** Run `npm run typecheck` frequently

## 🚀 DEVELOPMENT WORKFLOW

### Pre-commit Validation (ALL REQUIRED)

```bash
npm run lint          # Oxlint validation
npm run typecheck     # TypeScript checks
npm run format:check  # Prettier formatting
npm run test          # Test suite
```

### Environment Variables

- Frontend: `import.meta.env.VITE_*` (NOT `process.env`)
- Backend: Set via `npx convex env set KEY "value"`
- Never commit `.env` files

### Key Commands

```bash
# Development
npm run dev              # Start frontend + backend
npx convex dev          # Convex hot reload
npx convex dev --once   # Deploy without watching

# Deployment
npx convex deploy       # Production deploy
npx convex dashboard    # Open dashboard

# Quality
npm run validate        # All checks
npm run clean:all       # Full reset
```

## ⚠️ CRITICAL RULES

### Modern Stack Requirements

- React 19 patterns only (no class components)
- Convex subscriptions for data (no useEffect fetching)
- Tailwind CSS for styling
- Vite environment variables (`import.meta.env.VITE_*`)
- AI SDK for LLM integration

### Commit Conventions

`feat:` | `fix:` | `docs:` | `style:` | `refactor:` | `test:` | `chore:` | `perf:`

## 📋 VERIFICATION CHECKLIST

Before ANY commit:

- [ ] Searched for existing code before writing new
- [ ] No redundant implementations
- [ ] Verified against live documentation
- [ ] All imports from correct sources
- [ ] Types from `_generated/` only
- [ ] `npm run validate` passes with 0 errors
- [ ] Files under 500 lines
- [ ] No circular dependencies

---

**REMEMBER:** Zero temperature = Zero assumptions. Verify EVERYTHING through documentation, no redundancy tolerated, type safety absolute.
