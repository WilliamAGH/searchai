#!/usr/bin/env node

/**
 * Custom lint rule to prevent manual Convex type definitions
 * Ensures all Convex types come from _generated directory
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const violations = [];

// Patterns that indicate manual Convex type definitions
const forbiddenPatterns = [
  // Manual Doc type definitions
  /interface\s+\w*(?:User|Chat|Message|Session|Preference)\s*\{[^}]*_id\s*:/,
  /type\s+\w*(?:User|Chat|Message|Session|Preference)\s*=\s*\{[^}]*_id\s*:/,

  // Manual Id type definitions
  /type\s+\w+Id\s*=\s*string/,
  /interface\s+\w+\s*\{[^}]*(?:userId|chatId|messageId)\s*:\s*string/,

  // Re-exporting from _generated (anti-pattern)
  /export\s*\{[^}]*(?:Doc|Id)[^}]*\}\s*from\s*["'].*\/_generated/,
  /export\s*\*\s*from\s*["'].*\/_generated\/dataModel/,

  // Manual schema duplication
  /const\s+\w*Schema\s*=\s*\{[^}]*_id\s*:/,
];

// Files/directories to check
const checkPaths = ["src/", "convex/"];

// Files/directories to exclude
const excludePaths = [
  "convex/_generated",
  "node_modules",
  ".next",
  "dist",
  "build",
];

function shouldCheckFile(filePath) {
  // Only check TypeScript files
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
    return false;
  }

  // Skip excluded paths
  for (const exclude of excludePaths) {
    if (filePath.includes(exclude)) {
      return false;
    }
  }

  return true;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  forbiddenPatterns.forEach((pattern) => {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        // Additional check: ensure it's not importing from _generated
        const prevLines = lines.slice(Math.max(0, index - 5), index).join("\n");
        const nextLines = lines
          .slice(index, Math.min(lines.length, index + 5))
          .join("\n");
        const context = prevLines + "\n" + line + "\n" + nextLines;

        // Skip if it's importing from _generated
        if (
          context.includes('from "../convex/_generated') ||
          context.includes('from "../../convex/_generated') ||
          context.includes('from "./_generated')
        ) {
          return;
        }

        violations.push({
          file: path.relative(rootDir, filePath),
          line: index + 1,
          content: line.trim(),
          pattern: pattern.toString(),
        });
      }
    });
  });
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip excluded directories
      if (!excludePaths.some((exclude) => filePath.includes(exclude))) {
        walkDir(filePath);
      }
    } else if (shouldCheckFile(filePath)) {
      checkFile(filePath);
    }
  });
}

// Run the linter
console.log("Checking for manual Convex type definitions...\n");

checkPaths.forEach((checkPath) => {
  const fullPath = path.join(rootDir, checkPath);
  if (fs.existsSync(fullPath)) {
    walkDir(fullPath);
  }
});

if (violations.length > 0) {
  console.error("[ERROR] Found manual Convex type definitions:\n");

  violations.forEach((violation) => {
    console.error(`  ${violation.file}:${violation.line}`);
    console.error(`    ${violation.content}`);
    console.error("");
  });

  console.error("\nHow to fix:");
  console.error("  1. Remove manual type definitions");
  console.error("  2. Import from convex/_generated/dataModel instead:");
  console.error(
    '     import type { Doc, Id } from "../convex/_generated/dataModel";',
  );
  console.error("  3. Use Convex-generated types:");
  console.error('     type User = Doc<"users">;');
  console.error('     type UserId = Id<"users">;');
  console.error("\n");

  process.exit(1);
} else {
  console.log("[OK] No manual Convex type definitions found!\n");
  process.exit(0);
}
