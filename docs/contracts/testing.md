# Testing

This repo uses:

- **Vitest** for unit tests
- **Playwright** for browser tests (smoke + integration)

## Configuration

```yaml
# Testing Tools
UNIT_TEST_FRAMEWORK: Vitest
E2E_TEST_FRAMEWORK: Playwright
COMPONENT_TEST_LIBRARY: React Testing Library
COVERAGE_PROVIDER: V8

# Runtime
NODE_VERSION: 22 LTS
VITE_VERSION: 6.x
REACT_VERSION: 19.1.x
```

## Critical Rules ([VR1] Enforcement)

### Structure & Location

- **Mirrored Structure**: All tests live in `__tests__/` and mirror the source directory structure.
  - `convex/chats.ts` → `__tests__/convex/chats.test.ts`
  - `src/components/ui/Button.tsx` → `__tests__/src/components/ui/Button.test.tsx`
- **Co-location Exception**: Only strictly purely unit-testable utils may be co-located if `config/vitest.config.ts` allows, but preference is `__tests__/`.

### Never Allowed

- **NO** `console.log` in tests (use debugger/Vitest UI)
- **NO** arbitrary timeouts (use `waitFor`/`findBy`)
- **NO** implementation detail testing
- **NO** snapshot tests without review
- **NO** skipped tests in main/dev branches

### Always Required

- **ALWAYS** test user-visible behavior
- **ALWAYS** use semantic queries (`getByRole`)
- **ALWAYS** clean up after tests (`afterEach`)
- **ALWAYS** mock external dependencies
- **ALWAYS** maintain 80%+ coverage

## Unit tests (Vitest)

```bash
npm run test
```

Useful variants:

- `npm run test:watch`
- `npm run test:single` (single-fork, faster iteration)
- `npm run test:ci`

## Browser tests (Playwright)

Playwright is included as a dev dependency, and `npm install` runs `npm run playwright:install` to install Chromium.

```bash
npm run test:playwright
```

Smoke tests:

```bash
npm run test:smoke
```

Proxy runtime (serves `dist/` via `server.mjs` and proxies `/api/*` to `CONVEX_SITE_URL`):

```bash
PLAYWRIGHT_RUNTIME=proxy CONVEX_SITE_URL="https://<deployment>.convex.site" npm run test:smoke
```

Integration tests:

```bash
npm run test:integration
```

## Philosophy

### The Testing Trophy (2025)

```text
       /\        E2E Tests (10%)
      /  \       - Critical user journeys
     /    \      - Smoke tests
    /------\     Integration Tests (30%)
   /        \    - Component integration
  /          \   - API integration
 /            \  Unit Tests (60%)
/______________\ - Business logic
                 - Utilities
                 - Hooks
```

### Principles

1. **Confidence**: Focus on critical paths.
2. **Behavior**: Test what the user experiences.
3. **Hygiene**: Keep tests simple, fast, and reliable.
4. **Tools**: Unit for logic, E2E for workflows.
5. **Accessibility**: Include a11y testing.

## Vitest Configuration

```typescript
// config/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks", // Avoids tinypool issues
    coverage: {
      provider: "v8",
      thresholds: {
        global: { branches: 80, functions: 80, lines: 80, statements: 80 },
      },
    },
  },
});
```

## API Mocking (MSW)

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse } from "msw";
export const handlers = [
  http.get("/api/chats", () => HttpResponse.json([{ id: "1", title: "Test" }])),
];

// src/test/setup.ts
import { server } from "./mocks/server";
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Component Testing Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('ChatInterface', () => {
  let user: ReturnType<typeof userEvent.setup>
  beforeEach(() => { user = userEvent.setup() })

  it('should handle user input', async () => {
    render(<ChatInterface />)
    const input = screen.getByRole('textbox', { name: /message/i })

    await user.type(input, 'Hello')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument()
    })
  })
})
```

## Hook Testing Pattern

```typescript
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../hooks/useChat";

describe("useChat", () => {
  it("should manage state", async () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      await result.current.sendMessage("Hello");
    });
    expect(result.current.messages).toHaveLength(1);
  });
});
```

## Page Object Model (Playwright)

```typescript
// tests/e2e/pages/ChatPage.ts
import { Page, Locator } from "@playwright/test";

export class ChatPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.getByRole("textbox", { name: /type a message/i });
    this.sendButton = page.getByRole("button", { name: /send/i });
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  async sendMessage(message: string) {
    await this.messageInput.fill(message);
    await this.sendButton.click();
    await this.page.waitForSelector(`text="${message}"`);
  }
}
```

## Common Pitfalls

1. **Testing Implementation Details**: Avoid testing internal state. Test user-visible behavior.
2. **Not Cleaning Up**: Use `afterEach(() => { cleanup(); vi.clearAllMocks() })`.
3. **Arbitrary Timeouts**: Use `waitFor` or `findBy`, never `setTimeout`.
4. **Third-Party Libraries**: Test the result/effect, not the library internals.

## Debugging

```bash
# Vitest
npm run test:ui
npx vitest --reporter=verbose path/to/test.spec.ts

# Playwright
npx playwright test --debug
npx playwright test --ui
npx playwright codegen localhost:5173
```
