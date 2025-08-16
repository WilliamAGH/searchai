# 🔍 Delete Functionality Debug Test Instructions

## Setup Complete

I've added comprehensive debug logging at EVERY step of the delete chain. The logs are numbered sequentially to track the exact flow.

## How to Test

1. **Open Browser DevTools Console** (F12 → Console tab)

2. **Refresh the app** to load the new debug code

3. **Watch for Initial Logs** - You should see:

   ```
   [DELETE-1] Message ID extraction: {...}
   [DELETE-2] Delete button RENDERING for ID: ...
   OR
   [DELETE-2] Delete button NOT RENDERING - no ID available
   ```

4. **Click a Delete Button** and watch for:

   ```
   [DELETE-3] Delete button clicked!
   [DELETE-4] Calling onDeleteMessage with ID: ...
   [DELETE-5] handleDeleteMessage received: ...
   [DELETE-5.5] User confirmation: true/false
   ```

5. **Follow the Routing** - One of these will appear:

   ```
   [DELETE-6A] Routing to onRequestDeleteMessage handler
   [DELETE-6B] Routing to local delete handler
   [DELETE-6C] Routing to Convex mutation
   ```

6. **If using Convex**, watch for:
   ```
   [DELETE-7] useDeletionHandlers.handleRequestDeleteMessage called
   [DELETE-8] ID validation result: ...
   [DELETE-9] Calling Convex deleteMessage mutation...
   [DELETE-BACKEND-1] Delete mutation called with ID: ...
   [DELETE-BACKEND-2] Message lookup result: ...
   [DELETE-BACKEND-3] Authorization check: ...
   [DELETE-BACKEND-4] Message deleted successfully
   [DELETE-10] Mutation completed successfully
   ```

## Common Failure Points

### ❌ No Delete Button Shows

- Look for: `[DELETE-2] Delete button NOT RENDERING`
- Problem: Message has no `_id` or `id` field
- Check: `[DELETE-1]` logs to see what fields the message has

### ❌ Button Clicks But Nothing Happens

- Look for: `[DELETE-4] ERROR: No message ID available`
- Problem: ID extraction failed
- Check: `[DELETE-3]` logs for the message structure

### ❌ Validation Fails

- Look for: `[DELETE-8] ERROR: VALIDATION FAILED`
- Problem: ID doesn't match expected format
- Check: Does the ID contain a pipe `|` character?

### ❌ Backend Authorization Fails

- Look for: `[DELETE-BACKEND-3] ERROR: Unauthorized`
- Problem: User doesn't own the message
- Check: The `chat_userId` vs `current_userId` in the logs

### ❌ Message Not Found

- Look for: `[DELETE-BACKEND-2] ERROR: Message not found`
- Problem: ID doesn't exist in database
- Check: The messageId being passed

## Expected Success Flow

For a successful delete, you should see this sequence:

```
[DELETE-1] Message ID extraction: {messageIdValue: "abc123|def456"}
[DELETE-2] Delete button RENDERING for ID: abc123|def456
[DELETE-3] Delete button clicked!
[DELETE-4] Calling onDeleteMessage with ID: abc123|def456
[DELETE-5] handleDeleteMessage received: {messageId: "abc123|def456"}
[DELETE-5.5] User confirmation: true
[DELETE-6C] Routing to Convex mutation (or 6A/6B depending on setup)
[DELETE-BACKEND-1] Delete mutation called
[DELETE-BACKEND-2] Message lookup result: {found: true}
[DELETE-BACKEND-3] Authorization check: {is_owner: true}
[DELETE-BACKEND-4] Message deleted successfully
```

## Quick Diagnosis

Run this in console to see current state:

```javascript
// Count delete buttons
document.querySelectorAll('button[aria-label="Delete message"]').length;

// Check for errors in last 100 console logs
console.logs = console.logs || [];
const origLog = console.log;
console.log = function (...args) {
  console.logs.push(args);
  origLog.apply(console, args);
};

// Filter for DELETE logs
console.logs
  .filter((log) => log[0] && log[0].includes("[DELETE"))
  .forEach((log) => console.log(...log));
```

## Report Format

When reporting issues, please provide:

1. Which `[DELETE-X]` step was the last successful one
2. Any ERROR logs that appeared
3. The exact ID value being processed
4. Whether you're authenticated or using local storage
