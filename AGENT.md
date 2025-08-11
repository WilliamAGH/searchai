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
VALIDATION_SCHEMA_LIB: Zod
SCHEMA_VERSION: 4.x

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

- Schema-driven development
- Type-safe API functions
- Real-time subscriptions
- Separate TypeScript config for backend

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
│   ├── types/         # TypeScript type definitions
│   └── styles/        # CSS and styling
├── convex/            # Convex backend
│   ├── _generated/    # Auto-generated Convex types
│   └── *.ts          # Backend functions
├── tests/             # Test files
└── public/            # Static assets
```

## 🚀 KEY COMMANDS

```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Frontend only (Vite)
npm run dev:backend      # Backend only (Convex)

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

- Convex deployment variables
- OpenAI API keys
- Authentication providers
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

**REMEMBER**: This is a ZERO TEMPERATURE environment. Every line of code must be verified against current documentation. Training data is outdated. Memory is unreliable. Only live documentation is truth. No assumptions - verify EVERYTHING through MCP tools, web search, and direct documentation fetch.
