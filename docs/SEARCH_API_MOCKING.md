# Search API Mocking Implementation Guide

## Current Status ❌

Your project currently **DOES NOT** have reliable mocking for the search API. The existing tests use minimal `vi.stubGlobal` for fetch, which doesn't provide comprehensive synthetic behavior.

## What's Missing

1. **MSW (Mock Service Worker)** - Not installed despite being recommended in your testing guidelines
2. **Comprehensive mocks** for all search providers (SERP API, OpenRouter, DuckDuckGo)
3. **Deterministic test scenarios** for different search behaviors
4. **Fallback chain testing** capabilities
5. **Error simulation** and resilience testing

## Implementation Steps

### 1. Install MSW

```bash
npm install --save-dev msw@latest
```

### 2. Update Test Setup

Add to your `tests/setup.ts`:

```typescript
import { setupMockServer } from "./mocks/server";

// Setup MSW for all tests
setupMockServer();
```

### 3. Configure Vitest

Update `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts", "./tests/mocks/server.ts"],
    // ... rest of config
  },
});
```

## Features of the New Mock Infrastructure

### 1. **100% Synthetic Behavior**

- Deterministic responses for all search providers
- Predefined results for common queries
- Synthetic result generation for unknown queries

### 2. **Test Scenarios**

```typescript
SEARCH_TEST_SCENARIOS = {
  STANDARD, // Normal operation
  NO_RESULTS, // Empty results
  ERROR, // Provider errors
  TIMEOUT, // Network timeouts
  RATE_LIMITED, // 429 responses
  PARTIAL_RESULTS, // Incomplete data
  CREATOR_QUERY, // Special handling
  TECHNICAL_QUERY, // Documentation results
  CURRENT_EVENTS, // News results
};
```

### 3. **Provider Fallback Testing**

- Test the complete fallback chain: SERP → OpenRouter → DuckDuckGo → Fallback
- Verify proper error handling between providers
- Ensure graceful degradation

### 4. **Controllable Test Conditions**

```typescript
// Control test behavior
setSearchTestScenario(SEARCH_TEST_SCENARIOS.ERROR);
setResponseDelay(500); // Simulate network latency
setErrorRate(0.3); // 30% random errors
```

### 5. **Test Helper Utilities**

```typescript
const searchTestHelper = new SearchTestHelper();

// Track API calls
searchTestHelper.getCallCount("serp");
searchTestHelper.verifyFallbackChain();
searchTestHelper.verifyCaching("query");
```

## Usage Examples

### Basic Search Test

```typescript
it("should search with mocked results", async () => {
  const results = await searchWeb({
    query: "React hooks",
    maxResults: 5,
  });

  expect(results.results[0].url).toContain("react.dev");
  expect(results.hasRealResults).toBe(true);
});
```

### Error Handling Test

```typescript
it("should handle provider failures", async () => {
  setSearchTestScenario(SEARCH_TEST_SCENARIOS.ERROR);

  const results = await searchWeb({
    query: "test",
    maxResults: 5,
  });

  // Should fallback gracefully
  expect(results.searchMethod).toBe("fallback");
});
```

### Planner Intelligence Test

```typescript
it("should plan searches correctly", async () => {
  const plan = await planSearch({
    chatId: "test-id",
    newMessage: "What is AI?",
    maxContextMessages: 10,
  });

  expect(plan.shouldSearch).toBe(true);
  expect(plan.queries.length).toBeGreaterThan(0);
});
```

## Benefits

1. **Deterministic Testing**: Same input always produces same output
2. **No Network Dependencies**: Tests run offline
3. **Fast Execution**: No real API calls
4. **Edge Case Coverage**: Test scenarios that are rare in production
5. **CI/CD Friendly**: No API keys or rate limits in tests
6. **Comprehensive Coverage**: Test all code paths including error handling

## Testing Different Types

### Unit Tests

- Test individual search providers in isolation
- Verify parsing logic
- Test caching behavior

### Integration Tests

- Test provider fallback chains
- Verify planner integration
- Test concurrent searches

### E2E Tests (with Playwright)

- Use MSW to mock backend search APIs
- Test complete user flows
- Verify UI updates with search results

### Smoke Tests

- Quick verification of critical paths
- Basic search functionality
- Error state handling

## Monitoring Test Quality

### Coverage Metrics

- Provider coverage: All 3 providers tested
- Scenario coverage: All test scenarios exercised
- Error path coverage: All error handlers tested
- Cache coverage: Cache hit/miss scenarios

### Test Reliability

- No flaky tests due to network issues
- Consistent timing with controlled delays
- Predictable error simulation

## Migration Path

1. **Phase 1**: Install MSW and basic setup
2. **Phase 2**: Migrate existing tests to use mocks
3. **Phase 3**: Add comprehensive test scenarios
4. **Phase 4**: Implement E2E tests with mocks
5. **Phase 5**: Remove any remaining live API calls in tests

## Maintenance

### Adding New Search Providers

1. Add mock handler in `search-api-mocks.ts`
2. Add to fallback chain tests
3. Update test scenarios if needed

### Updating Mock Data

1. Keep mock results realistic
2. Update based on actual API responses
3. Add new query patterns as needed

### Performance Testing

```typescript
// Test with delays
setResponseDelay(2000); // 2 second delay

// Test with high error rates
setErrorRate(0.5); // 50% failure rate
```

## Conclusion

With this implementation, you will have:

- ✅ 100% synthetic behavior for all search APIs
- ✅ Deterministic, reliable tests
- ✅ Complete coverage of error scenarios
- ✅ Fast, offline test execution
- ✅ Comprehensive test utilities

This provides the foundation for reliable, maintainable tests that give confidence in your search functionality without depending on external services.
