#!/bin/bash
set -e

echo "🚀 Starting safe push sequence..."

# 1. Run validation suite (lint, typecheck, tests, build)
echo "----------------------------------------------------------------"
echo "🔍 Step 1: Validation Suite (npm run validate)"
echo "----------------------------------------------------------------"
npm run validate

# 2. Run Convex dry-run
echo "----------------------------------------------------------------"
echo "🔍 Step 2: Convex Dry-Run"
echo "----------------------------------------------------------------"
node scripts/lib/timeout.mjs --timeout-sec 60 --kill-after-sec 10 -- npx convex dev --once --typecheck=enable --codegen=disable --tail-logs=disable

# 3. Run Playwright smoke test (with browser path fix)
echo "----------------------------------------------------------------"
echo "🔍 Step 3: Playwright Smoke Test"
echo "----------------------------------------------------------------"
# Explicitly unset PLAYWRIGHT_BROWSERS_PATH to avoid Cursor sandbox issues
env -u PLAYWRIGHT_BROWSERS_PATH npx playwright test --config config/playwright.config.ts -g smoke --reporter=line

# 4. Push
echo "----------------------------------------------------------------"
echo "✅ All checks passed. Pushing to remote..."
echo "----------------------------------------------------------------"
# Use --no-verify to skip the pre-push hooks since we just ran them manually
git push --no-verify "$@"

echo "🚀 Push complete!"
