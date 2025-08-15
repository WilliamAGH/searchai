# Pre-Commit Regression Checks

## ChatToolbar Visibility Check

**AUTOMATED CHECK**: The pre-commit hook will warn if you modify:

- `src/components/ChatInterface.tsx` near the ChatToolbar render
- `src/components/ChatToolbar.tsx`
- `tests/e2e/smoke-new-chat-share.spec.ts`

### The Check Pattern

```bash
# This runs automatically on commit
if git diff --cached --name-only | grep -E "(ChatInterface|ChatToolbar|smoke-new-chat-share)"; then
  echo "⚠️  WARNING: You're modifying files related to ChatToolbar visibility"
  echo "📋 CHECKLIST:"
  echo "  □ ChatToolbar must have: currentChatId && messages.length > 0"
  echo "  □ Test must wait for messages before expecting share button"
  echo "  □ Read docs/CHAT_TOOLBAR_REGRESSION_PREVENTION.md"
fi
```

### If You See This Warning

1. **STOP** and read the documentation
2. **CHECK** that you haven't removed `messages.length > 0`
3. **VERIFY** tests still check for empty chat state
4. **ENSURE** the UX principle is maintained: No content = No buttons

### Common Mistakes to Avoid

❌ **DON'T**: Remove `messages.length > 0` to "fix" a test
❌ **DON'T**: Make ChatToolbar always visible
❌ **DON'T**: Remove the empty chat assertion from tests
❌ **DON'T**: Bypass the regression test

✅ **DO**: Fix async timing issues in tests
✅ **DO**: Ensure proper wait conditions
✅ **DO**: Keep both condition checks
✅ **DO**: Maintain the UX principle

### The Golden Rule

> **Empty chats have nothing to share or copy, so they should not show share or copy buttons.**

This is not negotiable. It's a fundamental UX principle.
