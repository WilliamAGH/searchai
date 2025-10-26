# Test Migration Guide: Removing Arbitrary Timeouts

## Overview

This guide helps migrate tests from using arbitrary `waitForTimeout()` calls to proper wait conditions.

## Migration Patterns

### 1. Waiting for Animations

**Before:**

```typescript
await page.waitForTimeout(500); // Wait for sidebar animation
```

**After:**

```typescript
import { waitForSidebarAnimation } from "../helpers/wait-conditions";
await waitForSidebarAnimation(page);
```

### 2. Waiting for Network

**Before:**

```typescript
await page.waitForTimeout(1000); // Wait for API call
```

**After:**

```typescript
import { waitForNetworkIdle } from "../helpers/wait-conditions";
await waitForNetworkIdle(page);
```

### 3. Waiting for Elements

**Before:**

```typescript
await page.waitForTimeout(500); // Wait for element to appear
```

**After:**

```typescript
await page.waitForSelector('[data-testid="element"]', { state: "visible" });
```

### 4. Waiting for Navigation

**Before:**

```typescript
await page.waitForTimeout(500); // Allow for history state update
```

**After:**

```typescript
import { waitForNavigation } from "../helpers/wait-conditions";
await waitForNavigation(page, "/expected-path");
```

### 5. Waiting for React Updates

**Before:**

```typescript
await page.waitForTimeout(100); // Small delay for React
```

**After:**

```typescript
await page.waitForFunction(() =>
  document.querySelector('[data-loaded="true"]'),
);
```

## Common Wait Conditions

### Element Visibility

```typescript
await page.waitForSelector("selector", { state: "visible" });
await page.waitForSelector("selector", { state: "hidden" });
```

### Text Content

```typescript
await page.waitForSelector("text=Expected Text");
await page.waitForFunction(() => document.body.textContent?.includes("text"));
```

### Network State

```typescript
await page.waitForLoadState("networkidle");
await page.waitForLoadState("domcontentloaded");
```

### Custom Conditions

```typescript
await page.waitForFunction(() => {
  // Custom JavaScript that returns true when ready
  return window.someGlobalFlag === true;
});
```

## Best Practices

1. **Use data attributes** for test targeting:

   ```typescript
   // Add to component
   <div data-testid="chat-list" data-loaded={isLoaded}>

   // Wait in test
   await page.waitForSelector('[data-testid="chat-list"][data-loaded="true"]');
   ```

2. **Wait for specific conditions**, not time:

   - ❌ `waitForTimeout(1000)`
   - ✅ `waitForSelector('[data-ready]')`

3. **Use appropriate timeouts**:

   ```typescript
   // Quick UI changes: 2-3 seconds
   await page.waitForSelector("selector", { timeout: 3000 });

   // Network requests: 5-10 seconds
   await page.waitForLoadState("networkidle", { timeout: 10000 });

   // Long operations: 15-30 seconds
   await page.waitForSelector("selector", { timeout: 30000 });
   ```

4. **Combine conditions** when needed:
   ```typescript
   await Promise.all([
     page.waitForLoadState("networkidle"),
     page.waitForSelector("[data-loaded]"),
   ]);
   ```

## Files to Migrate

Priority files with most arbitrary timeouts:

- `tests/e2e/new-chat.spec.ts` (15+ timeouts)
- `tests/e2e/share-links.spec.ts` (5+ timeouts)
- `tests/integration/race-condition-fix.test.ts` (5+ timeouts)
- `tests/e2e/chat-navigation.spec.ts` (1 timeout)
- `tests/e2e/smoke-new-chat-share.spec.ts` (2 timeouts)

## Testing the Migration

After migrating:

1. Run tests locally to verify they pass
2. Check for flakiness by running multiple times
3. Ensure tests fail appropriately when conditions aren't met
4. Verify no performance regression
