#!/bin/bash
# Run E2E tests with mocked APIs to avoid burning through API quota

echo "🧪 Starting E2E tests with mocked APIs..."

# Set TEST_MODE environment variable for Convex backend
export TEST_MODE=true
export NODE_ENV=test

# Deploy test mode to Convex (temporary)
echo "📦 Deploying test mode to Convex..."
npx convex env set TEST_MODE "true" --preview
npx convex deploy --preview

# Run the tests
echo "🏃 Running E2E tests..."
npm run test:smoke

# Clean up - remove TEST_MODE from Convex
echo "🧹 Cleaning up test environment..."
npx convex env unset TEST_MODE --preview

echo "✅ Test run complete!"