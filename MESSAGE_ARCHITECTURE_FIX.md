# Message Architecture Fix

## Current Problems

1. Multiple message sources (streaming, paginated, regular)
2. Duplicate React keys from ID mismatches
3. Infinite loops from bidirectional state sync
4. Race conditions between async operations

## Proper Architecture

### Message Source Hierarchy

```
IF authenticated AND valid Convex ID:
  USE paginated messages ONLY
ELSE IF anonymous OR local storage:
  USE unified messages ONLY
NEVER mix sources
```

### ID Consistency Rules

```
- UnifiedChat.id = primary identifier
- Chat._id = same as id (for compatibility)
- currentChatId = always matches id field
- Never use _id if id exists
```

### State Sync Rules

```
1. URL → State: ONLY on initial mount
2. State → URL: Always (unidirectional)
3. Never bidirectional sync
```

## Implementation Checklist

- [ ] Disable streaming message enhancement in MessageList
- [ ] Use single message source based on auth state
- [ ] Ensure consistent ID usage across components
- [ ] Make URL sync unidirectional
- [ ] Add guards against race conditions
- [ ] Remove redundant state management hooks

## Testing Requirements

- [ ] No duplicate key errors
- [ ] No infinite fetching loops
- [ ] Correct chat selection in sidebar
- [ ] Proper pagination behavior
- [ ] Clean navigation between chats
