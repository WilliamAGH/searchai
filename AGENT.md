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

1. **MCP Documentation Lookup** (REQUIRED):

   ```
   @mcp__context7__resolve-library-id libraryName="react"
   @mcp__context7__get-library-docs context7CompatibleLibraryID="[id]" topic="[specific-feature]"
   ```

2. **Web Search for Current Patterns** (REQUIRED):

   - Use @mcp**brave-search**brave_web_search for:
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

- Any `@ts-ignore` or `@ts-expect-error`
- Any `eslint-disable` comments
- Any `any` type without explicit justification
- Any unvalidated external data
- Any type assertions without runtime checks

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

### 🚨 CRITICAL: Convex Type Generation & Validation - DO NOT DUPLICATE

**ABSOLUTELY FORBIDDEN - NEVER CREATE REDUNDANT TYPE DEFINITIONS:**

Convex automatically generates all required TypeScript types in the `convex/_generated/` directory. These files are managed by Convex and regenerated on every `npx convex dev` or `npx convex codegen` command.

**CONVEX PROVIDES COMPLETE TYPE SAFETY:**

- Automatic type generation from schema
- Runtime validation of function arguments
- Serialization/deserialization handled automatically
- Client-server type synchronization via generated files
- Single source of truth: your schema.ts

**AUTO-GENERATED TYPES (NEVER MANUALLY CREATE):**

- `Doc<TableName>` - Document types for each table with all fields
- `Id<TableName>` - Type-safe document ID types for each table
- `DataModel` - Complete database schema representation
- `QueryCtx`, `MutationCtx`, `ActionCtx` - Typed context objects
- `api` and `internal` - Type-safe function references
- All argument and return types for Convex functions

**MANDATORY RULES:**

1. **NEVER** create duplicate type definitions for database documents
2. **NEVER** manually define types that mirror Convex schema
3. **NEVER** create custom ID types - use `Id<TableName>` from `_generated/dataModel`
4. **NEVER** modify or edit files in `convex/_generated/` directory
5. **ALWAYS** import types from `convex/_generated/dataModel` and `convex/_generated/api`
6. **ALWAYS** rely on Convex's automatic type inference for function arguments/returns

**CORRECT USAGE:**

```typescript
// ✅ CORRECT - Import from generated types
import { Doc, Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

// Use the generated types directly
const userId: Id<"users"> = "...";
const user: Doc<"users"> = await ctx.db.get(userId);
```

**INCORRECT USAGE:**

```typescript
// ❌ WRONG - Creating redundant type definitions
interface User {
  _id: string;
  name: string;
  email: string;
}

// ❌ WRONG - Duplicating what Convex already provides
type UserId = string;
type ChatDocument = {
  title: string;
  // ...
};
```

The Convex type generation system ensures perfect synchronization between your schema and TypeScript types. Any manual type definitions for database entities are redundant and create maintenance overhead.

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
- Convex for real-time backend
- Tailwind CSS for styling
- AI SDK for LLM integration

### Quality Standards

- Zero warnings/errors in validation
- Comprehensive test coverage
- Consistent code formatting
- Accessibility compliance

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

## 📁 PROJECT STRUCTURE

```
searchai-io/
├── src/                # React application source
│   ├── components/     # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Utilities and helpers
│   ├── types/         # UI-only types (NEVER database entities!)
│   └── styles/        # CSS and styling
├── convex/            # Convex backend
│   ├── _generated/    # Auto-generated Convex types (SOURCE OF TRUTH)
│   └── *.ts          # Backend functions
├── tests/             # Test files
└── public/            # Static assets
```

**⚠️ CRITICAL DISTINCTION - src/types/ Directory:**

- ✅ **ALLOWED**: UI-specific types (component props, form states, client-only interfaces)
- ❌ **FORBIDDEN**: Any type that duplicates Convex schema (User, Chat, Message, etc.)
- ❌ **FORBIDDEN**: Any ID types (use `Id<TableName>` from \_generated)
- ❌ **FORBIDDEN**: Any database document types (use `Doc<TableName>` from \_generated)

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

   - React 19: @mcp**context7**resolve-library-id libraryName="react"
   - Convex: @mcp**context7**resolve-library-id libraryName="convex"
   - Vite: @mcp**context7**resolve-library-id libraryName="vite"
   - AI SDK: @mcp**context7**resolve-library-id libraryName="@ai-sdk/react"

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
