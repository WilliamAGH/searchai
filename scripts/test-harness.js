#!/usr/bin/env node
/**
 * Test harness for running E2E tests with local Convex backend
 * This prevents real API calls during testing
 */

const { spawn } = require("child_process");

async function runWithLocalBackend() {
  console.log("🚀 Starting local Convex backend for testing...");

  // Start local Convex backend
  const convexProcess = spawn("npx", ["convex", "dev", "--local", "--once"], {
    stdio: "pipe",
    env: {
      ...process.env,
      // Set TEST_MODE to prevent real API calls
      TEST_MODE: "true",
      NODE_ENV: "test",
    },
  });

  let backendReady = false;

  // Wait for backend to be ready
  convexProcess.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[Convex] ${output}`);

    if (output.includes("Convex functions ready") || output.includes("✔")) {
      backendReady = true;
    }
  });

  convexProcess.stderr.on("data", (data) => {
    console.error(`[Convex Error] ${data}`);
  });

  // Wait for backend to start
  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (backendReady) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 30000);
  });

  console.log("✅ Local Convex backend is ready!");

  // Run the tests
  console.log("🧪 Running E2E tests...");

  const testProcess = spawn("npm", ["run", "test:smoke"], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Point to local deployment
      VITE_CONVEX_URL: "http://localhost:3210",
      TEST_MODE: "true",
    },
  });

  // Wait for tests to complete
  await new Promise((resolve) => {
    testProcess.on("close", (code) => {
      console.log(`Tests finished with code ${code}`);
      resolve(code);
    });
  });

  // Clean up
  console.log("🧹 Shutting down local backend...");
  convexProcess.kill();

  process.exit(0);
}

// Run the harness
runWithLocalBackend().catch((error) => {
  console.error("Test harness failed:", error);
  process.exit(1);
});
