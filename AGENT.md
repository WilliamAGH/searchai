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
TEST_COVERAGE_COMMAND: npm run test:coverage
TEST_WATCH_COMMAND: npm run test:watch
TEST_SMOKE_COMMAND: npm run test:smoke

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
TYPES_DIR: src/types/
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

## 🚨 ZERO TOLERANCE - MANDATORY VERIFICATION PROTOCOL

### CRITICAL: Never Use Training Data - Always Use Live Documentation

**ABSOLUTELY FORBIDDEN:**

- Using remembered API patterns from training data
- Assuming library behavior without checking current docs
- Writing code based on "common patterns" without verification
- Guessing at configuration options
- Using deprecated or outdated syntax

**MANDATORY FOR EVERY CODE CHANGE:**

1. **Documentation Lookup** (REQUIRED):

   - Use built-in web search for library documentation
   - Search for "[library] [version] documentation"
   - Verify API patterns in official docs

2. **Web Search for Current Patterns** (REQUIRED):

   - Use built-in google_web_search for:
     - "React 19.1 [specific feature] documentation"
     - "Vite 6 [configuration] 2024"
     - "Convex [API method] typescript"
     - Current best practices and migration guides

3. **Direct Documentation Fetch** (WHEN NEEDED):
   - Fetch official docs directly from source
   - Read package.json for exact versions
   - Check CHANGELOG.md for breaking changes

### Type Safety Violations - IMMEDIATE HALT

**NEVER ALLOWED:**

- Any `@ts-ignore` or `@ts-expect-error` EXCEPT for documented Convex TS2589 issues
- Any `eslint-disable` comments
- Any `any` type without explicit justification
- Any unvalidated external data
- Any type assertions without runtime checks

### 🚨 CONVEX TS2589 ERROR PREVENTION

**CRITICAL RULE: Avoid TypeScript TS2589 "Type instantiation is excessively deep" errors:**

- **NEVER** use `ctx.runMutation` or `ctx.runQuery` in httpAction handlers with complex nested arguments
- **NEVER** pass arrays of objects with multiple optional fields through `ctx.runMutation`
- **INSTEAD** simplify argument types or use `@ts-ignore` with clear documentation when unavoidable

**Known Problematic Patterns:**

```typescript
// ❌ CAUSES TS2589: Complex nested types in httpAction
await ctx.runMutation(api.chats.publishAnonymousChat, {
  messages: Array<{ role: string; content?: string; searchResults?: Array<...> }>
});

// ✅ ACCEPTABLE WORKAROUND: Document and use @ts-ignore
// @ts-ignore - Known Convex limitation with complex type inference
await ctx.runMutation(api.chats.publishAnonymousChat, { ... });
```

### Assumptions = VIOLATIONS

**BEFORE WRITING ANY CODE:**

1. Verify the exact API in current documentation
2. Check the specific version we're using
3. Confirm the feature exists in that version
4. Test the pattern with type checking

**NEVER ASSUME:**

- That a React hook works the same in v19 as v18
- That Vite config hasn't changed
- That Convex APIs are stable
- That TypeScript behavior is consistent
- That any pattern from memory is correct

## 🎯 PROJECT PRINCIPLES

### Type Safety First

- Full TypeScript coverage with strict mode enabled
- No `any` types without explicit justification
- Runtime validation for all external data
- Convex schema validation for backend

### 🚨 CRITICAL: Convex Type Generation & Import Strategy

**IMPORTANT UPDATE (August 2025):** After thorough analysis, we've determined that creating abstraction layers over Convex's `_generated` directory is an anti-pattern that should be avoided.

**CONVEX TYPE IMPORT RULES:**

1. **ALWAYS** import directly from `convex/_generated/` directories - this is Convex's intended pattern
2. **NEVER** create "wrapper" or "re-export" files like `convexTypes.ts`
3. **NEVER** manually duplicate types that Convex generates
4. **FOLLOW** Convex's official documentation patterns exactly

**WHY NO ABSTRACTION LAYER:**

- Convex's `_generated` directory IS the abstraction layer
- Re-export files can cause circular dependencies and compilation errors
- They add maintenance burden without benefit
- They break IDE auto-import and discovery
- They go against Convex framework conventions

**CORRECT IMPORT PATTERNS:**

```typescript
// ✅ BACKEND FILES (in convex/ directory)
import { query, mutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// ✅ FRONTEND FILES (in src/ directory)
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

// Use the generated types directly
const userId: Id<"users"> = "...";
const user: Doc<"users"> = await ctx.db.get(userId);
```

**INCORRECT PATTERNS TO AVOID:**

```typescript
// ❌ WRONG - Creating re-export abstraction files
// convex/lib/convexTypes.ts
export { Doc, Id } from "../_generated/dataModel";

// ❌ WRONG - Importing from abstraction instead of source
import { Doc, Id } from "./lib/convexTypes";

// ❌ WRONG - Creating duplicate type definitions
interface User {
  _id: string;
  name: string;
  email: string;
}
```

**AUTO-GENERATED TYPES (USE DIRECTLY):**

- `Doc<TableName>` - Document types for each table with all fields
- `Id<TableName>` - Type-safe document ID types for each table
- `DataModel` - Complete database schema representation
- `QueryCtx`, `MutationCtx`, `ActionCtx` - Typed context objects
- `api` and `internal` - Type-safe function references
- All argument and return types for Convex functions

**TYPE SAFETY GUARANTEE:**

Convex's type generation ensures perfect synchronization between your schema and TypeScript types. The `_generated` files update instantly when schema changes, providing complete type safety without any abstraction layers.

### ✅ LITMUS TEST: Full Convex Type Optimization

**VERIFICATION CHECKLIST - Our codebase MUST:**

1. Use ONLY Convex-generated `Doc<T>` types for all database documents
2. Use ONLY Convex-generated `Id<T>` types for all document references
3. Import ALL database types from `convex/_generated/dataModel`
4. Leverage Convex's automatic type inference for all function arguments
5. Have ZERO manual interface/type definitions that duplicate schema
6. Achieve 100% type safety through Convex's embedded type system

**CONVEX TYPE & VALIDATION BENEFITS WE MUST LEVERAGE:**

- **Automatic Schema Synchronization**: Types update instantly with schema changes
- **Compile-Time Safety**: Invalid table names or fields caught at build time
- **Runtime Validation**: Function args validated automatically at runtime
- **Perfect Type Inference**: Function arguments and returns typed automatically
- **System Fields Included**: `_id`, `_creationTime` automatically in `Doc<T>`
- **Cross-Table References**: Type-safe with `Id<TableName>` preventing mismatches
- **Serialization Handled**: Automatic JSON serialization/deserialization
- **Zero Maintenance**: No manual type updates ever needed

**UNIFIED TYPE STRATEGY:**

```typescript
// Our entire type system flows from Convex:
// schema.ts → npx convex dev → _generated/* → Full app type safety

// Frontend components
import type { Doc, Id } from "../convex/_generated/dataModel";
type ChatProps = { chat: Doc<"chats"> };

// API calls
import { api } from "../convex/_generated/api";
const result = await convex.query(api.chats.getChat, { chatId });
// ^ Fully typed arguments and return value

// No separate types folder needed for DB entities!
```

### Modern Stack

- React 19 with latest features
- Vite for blazing fast development
  - **CRITICAL: Use `import.meta.env.VITE_*` for environment variables, NOT `process.env`**
  - Example: `import.meta.env.VITE_CONVEX_URL` instead of `process.env.NEXT_PUBLIC_CONVEX_URL`
- Convex for real-time backend
- Tailwind CSS for styling
- AI SDK for LLM integration

### Quality Standards

- Zero warnings/errors in validation
- Comprehensive test coverage
- Consistent code formatting
- Accessibility compliance
- **File Size Limits**: Maximum 500 lines per file

## 🛠️ DEVELOPMENT WORKFLOW

### Pre-commit Validation

All code changes must pass:

1. `npm run lint` - Oxlint validation
2. `npm run typecheck` - TypeScript checks (both frontend and Convex)
3. `npm run format:check` - Prettier formatting
4. `npm run test` - Test suite execution

### Convex Backend

- Schema-driven development with AUTO-GENERATED types
- Type-safe API functions with ZERO manual type definitions
- Built-in runtime validation via `v` validators
- Real-time subscriptions with full type inference
- Automatic client-server type synchronization
- Separate TypeScript config for backend
- **CRITICAL**: ALL types come from `convex/_generated/*` - NO DUPLICATES
- **VALIDATION**: Use Convex `v` validators for all function arguments

**IMPORTANT**: For detailed Convex setup, deployment, and environment configuration, see [README.md](./README.md#initial-setup). This includes:

- Environment variable configuration
- Deployment commands for dev/prod
- API endpoint documentation
- Troubleshooting common issues

### AI Integration

- OpenAI SDK for completions
- Vercel AI SDK for streaming
- Proper error handling for AI failures
- Rate limiting and cost management

## 📁 PROJECT STRUCTURE & DIRECTORY BOUNDARIES

```
searchai-io/
├── src/                # React application (FRONTEND ONLY)
│   ├── components/     # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Frontend utilities
│   │   ├── validation/ # CLIENT-SIDE validation (UX only)
│   │   ├── utils/     # Frontend helpers
│   │   └── adapters/  # Frontend service adapters
│   ├── types/         # UI-only types (NEVER database entities!)
│   └── styles/        # CSS and styling
├── convex/            # Convex backend (BACKEND ONLY)
│   ├── _generated/    # Auto-generated Convex types (SOURCE OF TRUTH)
│   ├── lib/           # Backend utilities (CANNOT import from src/)
│   │   └── security/  # SERVER-SIDE validation & sanitization
│   │       ├── sanitization.ts  # Input sanitization, SearchResult normalization
│   │       ├── patterns.ts      # Security patterns
│   │       └── webContent.ts    # Web content security
│   ├── http/          # HTTP route handlers
│   │   └── routes/    # Individual route modules
│   └── *.ts          # Backend functions
├── tests/             # Test files
└── public/            # Static assets
```

### 🚨 CRITICAL DIRECTORY BOUNDARIES

**FRONTEND (`src/`) vs BACKEND (`convex/`) Separation:**

| Directory              | Purpose                               | Can Import From                          | CANNOT Import From                 |
| ---------------------- | ------------------------------------- | ---------------------------------------- | ---------------------------------- |
| `src/`                 | Frontend React app                    | `convex/_generated/`, other `src/` files | `convex/*.ts` (except \_generated) |
| `convex/`              | Backend functions                     | Other `convex/` files, Node modules      | ANY `src/` files                   |
| `src/lib/validation/`  | Client-side validation for UX         | `src/` files only                        | `convex/` files                    |
| `convex/lib/security/` | Server-side validation & sanitization | `convex/` files only                     | `src/` files                       |

**Why This Separation Exists:**

- Convex backend runs in a separate environment from the frontend
- Backend cannot access frontend code (different build processes)
- Frontend can only access backend through generated API types

### ⚠️ VALIDATION STRATEGY - WHERE TO PUT WHAT

**Client-Side (`src/lib/validation/`):**

- ✅ Form validation for immediate UX feedback
- ✅ Input length checks for user guidance
- ✅ Format validation (email, phone) for user hints
- ❌ NOT for security (can be bypassed)
- ❌ NOT for data normalization

**Server-Side (`convex/lib/security/`):**

- ✅ **MANDATORY** security sanitization
- ✅ Data normalization (e.g., normalizeSearchResult)
- ✅ HTML/XSS prevention
- ✅ Type coercion for external data
- ✅ Default value assignment

**Example - SearchResult Normalization:**

```typescript
// ❌ WRONG: In src/lib/validation/
export function normalizeSearchResult() { ... }

// ✅ CORRECT: In convex/lib/security/sanitization.ts
export function normalizeSearchResult(result: any): SearchResult {
  // Ensures relevanceScore is always present
  // Sanitizes title and snippet
  // Used by HTTP endpoints receiving external data
}
```

### 📋 TYPE DEFINITIONS - WHERE THEY BELONG

**Database Types:**

- ✅ **ONLY** from `convex/_generated/dataModel`
- ❌ NEVER manually define database types

**Business Logic Types (non-database):**

- If used only in backend → Define in relevant `convex/` file
- If used only in frontend → Define in `src/types/`
- If shared → Define in backend, import via API response types

**❌ NEVER Re-export Types:**

- Don't create "convenience" re-exports (e.g., `export type { SearchResult }`)
- Each file should import directly from the source of truth
- Re-exports create confusion about where types are defined
- Re-exports can mask circular dependencies
- Direct imports make code navigation clearer

**⚠️ CRITICAL DISTINCTION - src/types/ Directory:**

- ✅ **ALLOWED**: UI-specific types (component props, form states, client-only interfaces)
- ❌ **FORBIDDEN**: Any type that duplicates Convex schema (User, Chat, Message, etc.)
- ❌ **FORBIDDEN**: Any ID types (use `Id<TableName>` from \_generated)
- ❌ **FORBIDDEN**: Any database document types (use `Doc<TableName>` from \_generated)

## 📏 FILE SIZE & ORGANIZATION STANDARDS

### Maximum File Size: 500 Lines

**MANDATORY**: No single file should exceed 500 lines of code. This ensures:

- Better maintainability and readability
- Faster IDE performance and code navigation
- Easier code reviews and debugging
- Clear separation of concerns

### When to Split Files

**Split files when approaching 400 lines by:**

1. **Component Splitting** (React):

   ```typescript
   // Instead of one large ChatInterface.tsx (500+ lines)
   // Split into:
   components/
   ├── ChatInterface.tsx         // Main container (< 200 lines)
   ├── ChatHeader.tsx            // Header component (< 100 lines)
   ├── ChatMessageList.tsx       // Message display (< 150 lines)
   └── ChatInput.tsx             // Input controls (< 100 lines)
   ```

2. **Hook Extraction**:

   ```typescript
   // Extract complex logic into custom hooks
   hooks/
   ├── useChat.ts               // Chat state management
   ├── useChatSubscription.ts   // Real-time subscriptions
   └── useChatActions.ts        // Chat mutations
   ```

3. **Utility Function Separation**:

   ```typescript
   // Group related utilities
   lib/
   ├── validation/
   │   ├── input.ts            // Input validation
   │   └── email.ts            // Email-specific validation
   ├── formatting/
   │   ├── date.ts             // Date formatting
   │   └── message.ts          // Message formatting
   └── constants/
       └── limits.ts           // App-wide constants
   ```

4. **Convex Function Organization**:
   ```typescript
   // Split large Convex files by domain
   convex/
   ├── chats/
   │   ├── queries.ts          // Chat queries
   │   ├── mutations.ts        // Chat mutations
   │   └── subscriptions.ts    // Real-time subscriptions
   ├── messages/
   │   ├── queries.ts          // Message queries
   │   └── mutations.ts        // Message mutations
   └── users/
       └── queries.ts          // User queries
   ```

### Circular Dependency Prevention

**CRITICAL: Prevent circular dependencies through:**

1. **Dependency Direction**:

   ```
   UI Components → Hooks → Services → Types
   Never: Services → Components or Hooks → Components
   ```

2. **Type Import Strategy**:

   - Import Convex types ONLY from `_generated/dataModel`
   - Never create intermediate type files that re-export
   - UI types stay in `src/types/` and never import from components

3. **Common Anti-Patterns to Avoid**:

   ```typescript
   // ❌ WRONG: Circular dependency
   // fileA.ts
   import { something } from "./fileB";
   export const utilA = () => something();

   // fileB.ts
   import { utilA } from "./fileA"; // CIRCULAR!

   // ✅ CORRECT: Extract shared logic
   // shared.ts
   export const sharedUtil = () => {};

   // fileA.ts & fileB.ts
   import { sharedUtil } from "./shared";
   ```

4. **Barrel Exports Pattern**:

   ```typescript
   // ✅ Use index.ts for clean imports but avoid deep nesting
   components/Chat/
   ├── ChatHeader.tsx
   ├── ChatBody.tsx
   ├── ChatFooter.tsx
   └── index.ts         // Export all chat components

   // index.ts
   export { ChatHeader } from './ChatHeader';
   export { ChatBody } from './ChatBody';
   export { ChatFooter } from './ChatFooter';
   ```

5. **Dependency Validation**:
   - Run `npm run typecheck` frequently to catch circular dependencies
   - TypeScript will error on circular imports
   - Keep import chains shallow (max 3-4 levels deep)

## 🚀 KEY COMMANDS

```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Frontend only (Vite)
npm run dev:backend      # Backend only (Convex)

# Convex Operations (see README.md for complete guide)
npx convex dev          # Start dev deployment with hot reload
npx convex dev --once   # Deploy to dev without watching
npx convex deploy       # Deploy to production
npx convex logs         # View dev logs
npx convex logs --prod  # View production logs
npx convex dashboard    # Open Convex dashboard

# Environment Management
npx convex env set KEY "value"       # Set dev env variable
npx convex env set KEY "value" --prod # Set prod env variable
npx convex env list                   # List dev env variables
npx convex env list --prod            # List prod env variables

# Quality Checks
npm run validate         # Run all validations
npm run lint            # Run Oxlint
npm run lint:fix        # Fix linting issues
npm run typecheck       # TypeScript validation
npm run format          # Format code with Prettier

# Testing
npm run test            # Run all tests
npm run test:smoke      # Smoke tests only

# Build & Deploy
npm run build           # Production build
npm run preview         # Preview production build

# Maintenance
npm run clean           # Clear caches
npm run clean:all       # Full reset
```

## 🔒 SECURITY & ENVIRONMENT

### Required Environment Variables

**See [README.md](./README.md#environment-variables-reference) for complete list.**

Key variables:

- `VITE_CONVEX_URL` - Frontend build-time Convex URL
- `CONVEX_DEPLOYMENT` - CLI deployment target
- `CONVEX_RESEND_API_KEY` - Email service API key
- `OPENROUTER_API_KEY` - AI provider key
- `SERP_API_KEY` - Search API key
- Never commit `.env` files

### API Security

- Rate limiting on all endpoints
- Input sanitization
- CORS configuration
- Authentication required for mutations

## 📋 COMMIT CONVENTIONS

Follow conventional commits:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `style:` Formatting changes
- `refactor:` Code restructuring
- `test:` Test updates
- `chore:` Maintenance tasks
- `perf:` Performance improvements

## 🎨 STYLING GUIDELINES

- Tailwind CSS for all styling
- Component-specific styles in same file
- Responsive design with container queries
- Dark mode support
- Accessibility-first approach

## 🔍 MANDATORY PRE-TASK WORKFLOW

### Before ANY Code Changes:

1. **Check Current Versions**:

   ```bash
   cat package.json | grep -E '"(react|convex|vite|typescript)"'
   ```

2. **Fetch Live Documentation**:

   - Use web search for official documentation
   - React 19: Search for "React 19 documentation"
   - Convex: Search for "Convex documentation"
   - Vite: Search for "Vite documentation"
   - AI SDK: Search for "Vercel AI SDK documentation"

3. **Search for Current Patterns**:

   - Use web search for "[library] [version] [feature] site:official-docs"
   - Check Stack Overflow for recent answers (2024 only)
   - Verify against GitHub issues for known problems

4. **Validate Before Committing**:
   ```bash
   npm run validate  # MUST pass with 0 errors
   ```

## ⛔ FORBIDDEN PRACTICES

### NEVER Use Outdated Patterns:

- React class components (use function components)
- useEffect for data fetching (use Convex subscriptions)
- Deprecated React 18 patterns in React 19
- Old Vite config syntax
- Any polyfills for modern browsers

### NEVER Trust Memory:

- Every import must be verified
- Every API call must be checked
- Every config option must be confirmed
- Every type must be validated

### ALWAYS Verify Against:

- Current official documentation
- Actual installed package versions
- TypeScript compiler output
- Runtime behavior in development

---

## 🔧 CONVEX-SPECIFIC WORKFLOWS

### Switching Between Environments

```bash
# Work with dev deployment
export CONVEX_DEPLOYMENT=diligent-greyhound-240
npx convex dev

# Deploy to production
export CONVEX_DEPLOYMENT=vivid-boar-858
npx convex deploy -y
```

### Adding New Convex Functions

1. Create function in `convex/` directory
2. Ensure proper TypeScript types
3. Deploy to dev: `npx convex dev --once`
4. Test thoroughly
5. Deploy to prod: `npx convex deploy -y`

### Email Configuration (Resend)

- Dev/Prod use `CONVEX_RESEND_API_KEY`
- Email functions in `convex/email.ts`
- Templates use inline HTML for better compatibility

### Debugging Convex Issues

```bash
# Check function logs
npx convex logs --filter "functionName"

# View real-time logs
npx convex logs --follow

# Check deployment status
npx convex dashboard
```

**For complete Convex documentation, troubleshooting, and deployment guides, refer to [README.md](./README.md).**

---

**REMEMBER**: This is a ZERO TEMPERATURE environment. Every line of code must be verified against current documentation. Training data is outdated. Memory is unreliable. Only live documentation is truth. No assumptions - verify EVERYTHING through MCP tools, web search, and direct documentation fetch.
