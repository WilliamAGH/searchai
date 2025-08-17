#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Colors for terminal output
const colors = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

/**
 * Environment variable usage rules:
 *
 * Convex context (convex/**):
 * - Actions: Should use process.env (since they run in Node.js)
 * - Queries/Mutations: Should NOT use environment variables directly
 * - HTTP actions: Can use process.env in httpAction context
 *
 * Frontend context (src/**):
 * - Should use import.meta.env for Vite environment variables
 * - Should NOT use process.env (except in config files)
 *
 * Test files:
 * - Can use either pattern depending on context
 */

const PATTERNS = {
  processEnv: /\bprocess\.env\b/g,
  processEnvBracket: /\bprocess\[['"]env['"]\]/g,
  processEnvOptional: /\bprocess\?\.\s*env\b/g,
  importMetaEnv: /\bimport\.meta\.env\b/g,
  ctxEnv: /\bctx\.env\.get\b/g,
};

const IGNORE_PATTERNS = [
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "playwright-report",
  ".turbo",
  "convex/_generated",
  "*.md",
  "*.json",
  "*.config.js",
  "*.config.ts",
  "*.config.mjs",
  "scripts/",
  ".husky/",
];

function shouldIgnore(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return IGNORE_PATTERNS.some((pattern) => {
    if (pattern.startsWith("*")) {
      return normalized.endsWith(pattern.slice(1));
    }
    return normalized.includes(pattern.replace(/\\/g, "/"));
  });
}

function getAllFiles(dir, files = []) {
  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    if (shouldIgnore(fullPath)) continue;

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (
      stat.isFile() &&
      (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx"))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const relativePath = relative(projectRoot, filePath);
  const relPosix = relativePath.replace(/\\/g, "/");
  const issues = [];

  // Determine file context
  const isConvex = relPosix.startsWith("convex/");
  const isFrontend = relPosix.startsWith("src/");
  const isTest =
    relPosix.includes(".test.") ||
    relPosix.includes(".spec.") ||
    relPosix.includes("/tests/");

  // Skip test files - they can use any pattern
  if (isTest) {
    return issues;
  }

  // Check for environment variable usage patterns
  const processEnvMatches = [
    ...content.matchAll(PATTERNS.processEnv),
    ...content.matchAll(PATTERNS.processEnvBracket),
    ...content.matchAll(PATTERNS.processEnvOptional),
  ];
  const importMetaEnvMatches = [...content.matchAll(PATTERNS.importMetaEnv)];
  const ctxEnvMatches = [...content.matchAll(PATTERNS.ctxEnv)];

  if (isConvex) {
    // Check if it's likely an action or internal variant
    const isAction = /\b(?:internalAction|httpAction|action)\s*\(/.test(
      content,
    );
    const isQuery = /\b(?:internalQuery|query)\s*\(/.test(content);
    const isMutation = /\b(?:internalMutation|mutation)\s*\(/.test(content);

    if (isAction) {
      // Actions should use process.env, not import.meta.env
      if (importMetaEnvMatches.length > 0) {
        for (const match of importMetaEnvMatches) {
          const line = content.slice(0, match.index).split("\n").length;
          issues.push({
            type: "error",
            message: `Convex actions should use process.env, not import.meta.env`,
            line,
            column: match.index - content.lastIndexOf("\n", match.index - 1),
          });
        }
      }

      // Note: We now allow process.env in actions (Convex v1.x pattern)
      // ctx.env.get was the old pattern but is being phased out
      if (ctxEnvMatches.length > 0) {
        for (const match of ctxEnvMatches) {
          const line = content.slice(0, match.index).split("\n").length;
          issues.push({
            type: "warning",
            message: `Consider using process.env directly in Convex actions (ctx.env.get is deprecated)`,
            line,
            column: match.index - content.lastIndexOf("\n", match.index - 1),
          });
        }
      }
    } else if (isQuery || isMutation) {
      // Queries and mutations should not access environment variables directly
      if (processEnvMatches.length > 0 || importMetaEnvMatches.length > 0) {
        const matches = [...processEnvMatches, ...importMetaEnvMatches];
        for (const match of matches) {
          const line = content.slice(0, match.index).split("\n").length;
          issues.push({
            type: "error",
            message: `Convex queries/mutations cannot access environment variables directly. Pass values from actions instead.`,
            line,
            column: match.index - content.lastIndexOf("\n", match.index - 1),
          });
        }
      }
    }
  } else if (isFrontend) {
    // Frontend code should use import.meta.env, not process.env
    if (processEnvMatches.length > 0) {
      for (const match of processEnvMatches) {
        const line = content.slice(0, match.index).split("\n").length;
        issues.push({
          type: "error",
          message: `Frontend code should use import.meta.env for Vite, not process.env`,
          line,
          column: match.index - content.lastIndexOf("\n", match.index - 1),
        });
      }
    }

    // ctx.env.get should never be in frontend
    if (ctxEnvMatches.length > 0) {
      for (const match of ctxEnvMatches) {
        const line = content.slice(0, match.index).split("\n").length;
        issues.push({
          type: "error",
          message: `Frontend code cannot use ctx.env.get (this is Convex backend only)`,
          line,
          column: match.index - content.lastIndexOf("\n", match.index - 1),
        });
      }
    }
  }

  return issues.map((issue) => ({ ...issue, file: relativePath }));
}

function main() {
  console.log(
    `${colors.cyan}🔍 Checking environment variable usage patterns...${colors.reset}\n`,
  );

  const convexDir = join(projectRoot, "convex");
  const srcDir = join(projectRoot, "src");
  const convexFiles = existsSync(convexDir) ? getAllFiles(convexDir) : [];
  const srcFiles = existsSync(srcDir) ? getAllFiles(srcDir) : [];

  const allIssues = [];

  // Check all files
  for (const file of [...convexFiles, ...srcFiles]) {
    const issues = checkFile(file);
    allIssues.push(...issues);
  }

  // Report results
  if (allIssues.length === 0) {
    console.log(
      `${colors.green}✅ All environment variable usage patterns are correct!${colors.reset}`,
    );
    process.exit(0);
  }

  // Group issues by file
  const issuesByFile = {};
  for (const issue of allIssues) {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  }

  // Display issues
  let errorCount = 0;
  let warningCount = 0;

  for (const [file, issues] of Object.entries(issuesByFile)) {
    console.log(`${colors.bold}${file}${colors.reset}`);
    for (const issue of issues) {
      const icon = issue.type === "error" ? "❌" : "⚠️";
      const color = issue.type === "error" ? colors.red : colors.yellow;
      console.log(
        `  ${icon} ${color}Line ${issue.line}, Col ${issue.column}: ${issue.message}${colors.reset}`,
      );

      if (issue.type === "error") errorCount++;
      else warningCount++;
    }
    console.log();
  }

  // Summary
  console.log(`${colors.bold}Summary:${colors.reset}`);
  if (errorCount > 0) {
    console.log(`  ${colors.red}${errorCount} error(s)${colors.reset}`);
  }
  if (warningCount > 0) {
    console.log(`  ${colors.yellow}${warningCount} warning(s)${colors.reset}`);
  }

  // Exit with error if there are errors
  if (errorCount > 0) {
    console.log(
      `\n${colors.red}❌ Environment variable usage validation failed!${colors.reset}`,
    );
    console.log(`\n${colors.cyan}Guidelines:${colors.reset}`);
    console.log(
      `  • ${colors.bold}Convex actions:${colors.reset} Use process.env for environment variables`,
    );
    console.log(
      `  • ${colors.bold}Convex queries/mutations:${colors.reset} Cannot access env vars directly`,
    );
    console.log(
      `  • ${colors.bold}Frontend (src/):${colors.reset} Use import.meta.env for Vite variables`,
    );
    console.log(
      `  • ${colors.bold}Test files:${colors.reset} Can use either pattern as needed`,
    );
    process.exit(1);
  }

  process.exit(0);
}

// Run the script
main();
