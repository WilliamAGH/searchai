#!/usr/bin/env node
/**
 * Script to run integration tests with Convex backend
 * Starts Convex dev server, runs tests, then shuts down
 */

import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let convexProcess = null;
let testProcess = null;

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function startConvexBackend() {
  return new Promise((resolve, reject) => {
    log("🚀 Starting Convex backend...", YELLOW);

    convexProcess = spawn("npx", ["convex", "dev"], {
      stdio: "pipe",
      env: { ...process.env, CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY },
    });

    let convexReady = false;

    convexProcess.stdout.on("data", (data) => {
      const output = data.toString();

      // Look for signs that Convex is ready
      if (
        !convexReady &&
        (output.includes("✓ Loaded env variables") ||
          output.includes("Convex functions ready") ||
          output.includes("Watching for file changes") ||
          output.includes("✓"))
      ) {
        convexReady = true;
        log("✅ Convex backend is ready!", GREEN);
        resolve();
      }

      // Log Convex output in debug mode
      if (process.env.DEBUG) {
        console.log("Convex:", output);
      }
    });

    convexProcess.stderr.on("data", (data) => {
      const error = data.toString();
      // Ignore common warnings
      if (!error.includes("Warning") && !error.includes("Deprecation")) {
        console.error("Convex Error:", error);
      }
    });

    convexProcess.on("error", (error) => {
      log(`❌ Failed to start Convex: ${error.message}`, RED);
      reject(error);
    });

    // Timeout if Convex doesn't start within 30 seconds
    setTimeout(30000)
      .then(() => {
        if (!convexReady) {
          reject(new Error("Convex backend failed to start within 30 seconds"));
        }
      })
      .catch(() => {
        // Silent catch to satisfy linter - timeout already handled above
      });
  });
}

async function runIntegrationTests() {
  return new Promise((resolve, reject) => {
    log("🧪 Running integration tests...", YELLOW);

    // Run the integration tests that need backend
    const testFiles = [
      "tests/integration/search-api.test.ts",
      "tests/integration/chat-message-chaining.test.ts",
      "tests/integration/race-condition-fix.test.ts",
    ];

    testProcess = spawn("npx", ["vitest", "run", ...testFiles], {
      stdio: "inherit",
      env: { ...process.env },
    });

    testProcess.on("close", (code) => {
      if (code === 0) {
        log("✅ Integration tests passed!", GREEN);
        resolve(code);
      } else {
        log(`❌ Integration tests failed with code ${code}`, RED);
        reject(new Error(`Tests failed with code ${code}`));
      }
    });

    testProcess.on("error", (error) => {
      log(`❌ Failed to run tests: ${error.message}`, RED);
      reject(error);
    });
  });
}

async function cleanup() {
  log("🧹 Cleaning up...", YELLOW);

  if (testProcess && !testProcess.killed) {
    testProcess.kill();
  }

  if (convexProcess && !convexProcess.killed) {
    convexProcess.kill();
    // Give it a moment to clean up
    await setTimeout(1000);
  }

  log("👋 Done!", GREEN);
}

async function main() {
  let exitCode = 0;

  try {
    // Register cleanup handlers
    process.on("SIGINT", async () => {
      log("\n⚡ Interrupted, cleaning up...", YELLOW);
      await cleanup();
      process.exit(1);
    });

    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(1);
    });

    // Start Convex backend
    await startConvexBackend();

    // Wait a bit for everything to stabilize
    await setTimeout(2000);

    // Run tests
    await runIntegrationTests();
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, RED);
    exitCode = 1;
  } finally {
    await cleanup();
    process.exit(exitCode);
  }
}

// Run the script
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
