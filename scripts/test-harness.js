#!/usr/bin/env node
/**
 * Test harness for running E2E tests with local Convex backend
 * This prevents real API calls during testing
 */

const { spawn } = require("child_process");

async function runWithLocalBackend() {
  console.log("🚀 Starting local Convex backend for testing...");

  // Start local Convex backend (without --once to keep it running)
  const convexProcess = spawn("npx", ["convex", "dev", "--local"], {
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

  // Wait for backend to start (30s timeout)
  const started = await new Promise((resolve) => {
    let checkInterval;
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      resolve(false);
    }, 30000);
    checkInterval = setInterval(() => {
      if (backendReady) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve(true);
      }
    }, 500);
  });

  if (!started) {
    console.error("❌ Timed out waiting for local Convex backend to be ready.");
    convexProcess.kill();
    process.exit(1);
  }
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
  const testExitCode = await new Promise((resolve) => {
    testProcess.on("close", (code) => {
      console.log(`Tests finished with code ${code}`);
      resolve(code ?? 1);
    });
  });

  // Clean up
  console.log("🧹 Shutting down local backend...");
  convexProcess.kill();

  process.exit(testExitCode);
}

// Run the harness
runWithLocalBackend().catch((error) => {
  console.error("Test harness failed:", error);
  process.exit(1);
});
