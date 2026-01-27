# Testing Stack & Philosophy

## 📋 Configuration

```yaml
# Testing Tools
UNIT_TEST_FRAMEWORK: Vitest
E2E_TEST_FRAMEWORK: Playwright
COMPONENT_TEST_LIBRARY: React Testing Library
COVERAGE_PROVIDER: V8
API_MOCKING: MSW (Mock Service Worker)

# Runtime
NODE_VERSION: 22 LTS
VITE_VERSION: 6.x
REACT_VERSION: 19.1.x
```

## 🚨 Critical Rules ([VR1] Enforcement)

### Never Allowed

- ❌ **NO** `console.log` in tests (use debugger/Vitest UI)
- ❌ **NO** arbitrary timeouts (use `waitFor`/`findBy`)
- ❌ **NO** implementation detail testing
- ❌ **NO** snapshot tests without review
- ❌ **NO** skipped tests in main/dev branches

### Always Required

- ✅ **ALWAYS** test user-visible behavior
- ✅ **ALWAYS** use semantic queries (`getByRole`)
- ✅ **ALWAYS** clean up after tests (`afterEach`)
- ✅ **ALWAYS** mock external dependencies
- ✅ **ALWAYS** maintain 80%+ coverage

## 🎓 Philosophy

### The Testing Trophy (2025)

```
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
