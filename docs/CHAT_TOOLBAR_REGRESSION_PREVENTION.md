# Chat Toolbar Regression Prevention Guide

## The Problem

The Copy/Share toolbar keeps appearing on new chats before any messages are sent, even though it should only appear when there are actual messages to copy/share.

## Why This Regression Keeps Happening

### The Cycle

1. **Correct Code**: The toolbar should only render when `currentChatId && messages.length > 0`
2. **Test Failure**: E2E test `smoke-new-chat-share.spec.ts` expects to find the share button after sending a message
3. **Wrong Fix**: Developer removes the `messages.length > 0` check to make the test pass
4. **Bug Returns**: The toolbar now appears on empty chats
5. **Repeat**: The cycle continues with the next developer

## The Correct Implementation

### In `src/components/ChatInterface.tsx` (around line 562):

```tsx
{
  currentChatId && messages.length > 0 && (
    <ChatToolbar
      onShare={openShareModal}
      messages={messages}
      chatTitle={currentChat?.title}
    />
  );
}
```

**IMPORTANT**: Both conditions are required:

- `currentChatId`: Ensures a chat exists in the database
- `messages.length > 0`: Ensures there are messages to share/copy

## Test Considerations

### The E2E Test Must:

1. Send a message first
2. Wait for the message to appear in the DOM
3. Only then expect the share button to be visible

### Correct Test Pattern:

```javascript
// Wait for messages to exist before expecting share button
await page.waitForFunction(
  () => {
    const messages = document.querySelectorAll(
      '[data-role="user"], [data-role="assistant"]',
    );
    return messages.length > 0;
  },
  { timeout: 10000 },
);

// Now the share button should be visible
const shareButton = page.locator('button[aria-label="Share chat"]');
await expect(shareButton).toBeVisible({ timeout: 10000 });
```

## Red Flags to Watch For

1. **PR Changes**: Any PR that removes `messages.length > 0` from the ChatToolbar conditional
2. **Test Changes**: Any PR that removes the wait for messages in the E2E test
3. **Quick Fixes**: "Fix failing test" commits that don't investigate why the test is failing

## Testing the Fix

### Manual Test:

1. Start the app
2. Click "New Chat" or navigate to root `/`
3. **Before typing anything**, the Copy/Share toolbar should NOT be visible
4. Type and send a message
5. Only after the message appears should the toolbar become visible

### Automated Test:

The E2E test `smoke-new-chat-share.spec.ts` validates this behavior when written correctly.

## Alternative Solutions Considered (and Why They Don't Work)

1. **Only checking `currentChatId`**: Fails because a chat can exist without messages
2. **Only checking `messages.length`**: Fails because messages might exist from a previous chat during navigation
3. **Checking in the toolbar component**: Moves the problem but doesn't solve it

## Summary

**The toolbar should only appear when there's something to share.** An empty chat has nothing to share, so the toolbar should not be visible.

This is a UX principle, not just a technical detail. Users should not see actions for content that doesn't exist yet.
