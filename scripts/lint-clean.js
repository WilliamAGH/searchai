#!/usr/bin/env node

/**
 * Clean lint output handler
 * Filters test noise and provides a clean, concise validation summary
 */

import { spawn } from "child_process";

const VALIDATION_COMMANDS = [
  { name: "Oxlint", cmd: "npm", args: ["run", "lint"] },
  { name: "TypeScript", cmd: "npm", args: ["run", "typecheck"] },
  { name: "Prettier", cmd: "npm", args: ["run", "format:check"] },
  { name: "Convex Imports", cmd: "npm", args: ["run", "lint:convex-imports"] },
  { name: "Convex Types", cmd: "npm", args: ["run", "lint:convex-types"] },
];

// Patterns to filter out from output
const NOISE_PATTERNS = [
  /^stdout \|/,
  /^stderr \|/,
  /^> searchai-io@/,
  /^> [a-z-]+/,
  /test log/i,
  /test error/i,
  /test warn/i,
  /test info/i,
  /\[DEBUG\]/,
  /Chat validation:/,
  /\[CHAT_ACTIONS\]/,
  /at \/Users\//,
  /at file:\/\/\//,
  /at run[A-Z]/,
  /at process/,
  /^RUN\s+v\d+/,
  /^Test Files/,
  /^Tests/,
  /^Start at/,
  /^Duration/,
  /^✓ /,
  /^↓ /,
  /\(\d+ tests?\)/,
  /\d+ms$/,
  /^$/, // Empty lines
];

// Patterns that indicate actual errors
const ERROR_PATTERNS = [
  /Found \d+ warnings? and \d+ errors?/,
  /error TS\d+:/,
  /ERROR:/,
  /FAILED/,
  /✗ /,
];

// Patterns that indicate success
const SUCCESS_PATTERNS = [
  /Found 0 warnings and 0 errors/,
  /✅/,
  /All matched files use Prettier/,
  /checks passed/,
  /No manual Convex type definitions found/,
];

async function runCommand(name, cmd, args) {
  return new Promise((resolve) => {
    const result = {
      name,
      success: true,
      errors: [],
      warnings: [],
      summary: "",
    };

    const proc = spawn(cmd, args, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let output = "";
    let errorOutput = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    proc.on("close", (code) => {
      const allOutput = output + errorOutput;
      const lines = allOutput.split("\n");

      // Process output
      for (const line of lines) {
        // Skip noise
        if (NOISE_PATTERNS.some((pattern) => pattern.test(line))) {
          continue;
        }

        // Check for errors
        if (ERROR_PATTERNS.some((pattern) => pattern.test(line))) {
          if (line.includes("Found 0 warnings and 0 errors")) {
            result.summary = "✓ No issues found";
          } else {
            result.errors.push(line.trim());
            result.success = false;
          }
        }

        // Check for success messages
        else if (SUCCESS_PATTERNS.some((pattern) => pattern.test(line))) {
          if (!result.summary) {
            result.summary = line.trim();
          }
        }

        // Capture TypeScript errors specifically
        else if (line.includes("error TS")) {
          result.errors.push(line.trim());
          result.success = false;
        }
      }

      // Set default summary if none found
      if (!result.summary) {
        if (result.success) {
          result.summary = "✓ Passed";
        } else {
          result.summary = `✗ ${result.errors.length} error(s) found`;
        }
      }

      // Override success if exit code is non-zero (except for test command)
      if (code !== 0 && !args.includes("test:single")) {
        result.success = false;
        if (!result.errors.length) {
          result.summary = `✗ Process exited with code ${code}`;
        }
      }

      resolve(result);
    });
  });
}

async function main() {
  console.log("🔍 Running Clean Lint Validation\n");
  console.log("─".repeat(50));

  const results = [];
  let allSuccess = true;

  // Run each validation command
  for (const { name, cmd, args } of VALIDATION_COMMANDS) {
    process.stdout.write(`${name.padEnd(20)} ... `);
    const result = await runCommand(name, cmd, args);
    results.push(result);

    if (result.success) {
      console.log("✅", result.summary);
    } else {
      console.log("❌", result.summary);
      allSuccess = false;
    }
  }

  console.log("─".repeat(50));

  // Show any errors in detail
  const hasErrors = results.some((r) => r.errors.length > 0);
  if (hasErrors) {
    console.log("\n📋 Error Details:\n");
    for (const result of results) {
      if (result.errors.length > 0) {
        console.log(`  ${result.name}:`);
        for (const error of result.errors) {
          console.log(`    • ${error}`);
        }
        console.log();
      }
    }
  }

  // Final summary
  console.log("─".repeat(50));
  if (allSuccess) {
    console.log("\n✨ All validation checks passed!\n");
    process.exit(0);
  } else {
    console.log("\n⚠️  Some validation checks failed. See details above.\n");
    process.exit(1);
  }
}

// Handle errors
process.on("unhandledRejection", (err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

main().catch((err) => {
  console.error("Failed to run validation:", err);
  process.exit(1);
});
