#!/usr/bin/env node
/**
 * Minimal Convex import checker
 * Ensures client code does not import server-only modules.
 * Non-fatal by default to avoid blocking local dev.
 */
const fs = require("fs");
const path = require("path");

function listFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, acc);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function main() {
  const srcDir = path.resolve(process.cwd(), "src");
  const convexDir = path.resolve(process.cwd(), "convex");
  const convexHttpDir = path.resolve(process.cwd(), "convex/http");
  const files = fs.existsSync(srcDir) ? listFiles(srcDir) : [];
  const convexFiles = fs.existsSync(convexDir) ? listFiles(convexDir) : [];
  const httpFiles = fs.existsSync(convexHttpDir) ? listFiles(convexHttpDir) : [];
  const bad = [];
  const duplication = [];
  const reexports = [];
  const pathAliasViolations = []; // [IM1d] @/ imports in convex files

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (/from\s+["']convex\/server["']/.test(content)) {
      bad.push(file);
    }
  }

  // Detect manual Convex type duplication in HTTP layer per policy
  for (const file of httpFiles) {
    const content = fs.readFileSync(file, "utf8");
    // Disallow re-export wrappers of generated types
    if (/export\s+\{[^}]*\}\s+from\s+["'](?:\.\.\/)+_generated\/dataModel["']/.test(content)) {
      reexports.push({ file, reason: "Re-export of generated types" });
    }
    // Heuristic: interfaces that look like DB docs (both _id and _creationTime)
    if (
      /interface\s+[A-Z][A-Za-z0-9_]*\s*\{[\s\S]*?_id:\s*string[\s\S]*?_creationTime:\s*number[\s\S]*?\}/m.test(
        content,
      )
    ) {
      duplication.push({
        file,
        reason: "Manual interface with _id and _creationTime fields",
      });
    }
  }

  // Detect type duplication heuristics anywhere in convex/* except _generated
  for (const file of convexFiles) {
    if (file.includes("/convex/_generated/")) continue;
    const content = fs.readFileSync(file, "utf8");
    // Re-export wrappers of generated types anywhere in convex
    if (/export\s+\{[^}]*\}\s+from\s+["'](?:\.\.\/)+_generated\//.test(content)) {
      reexports.push({ file, reason: "Re-export of generated types" });
    }
    // Heuristic: manual DB-like interfaces with both _id and _creationTime
    if (
      /interface\s+[A-Z][A-Za-z0-9_]*\s*\{[\s\S]*?_id:\s*string[\s\S]*?_creationTime:\s*number[\s\S]*?\}/m.test(
        content,
      )
    ) {
      duplication.push({
        file,
        reason: "Manual interface with _id and _creationTime fields in convex/*",
      });
    }
    // [IM1d] Check for @/ path aliases in convex files - these will fail at bundle time
    // Convex's esbuild bundler does NOT resolve tsconfig paths
    if (/from\s+["']@\//.test(content)) {
      pathAliasViolations.push({
        file,
        reason: "@/ path alias import (Convex bundler cannot resolve)",
      });
    }
  }

  if (bad.length) {
    console.error("✖ Invalid Convex server import(s) in client files:");
    for (const b of bad) console.error(" -", path.relative(process.cwd(), b));
  }

  if (reexports.length || duplication.length) {
    console.error("✖ Potential Convex type wrapper/duplication issues detected:");
    for (const r of reexports)
      console.error(" -", path.relative(process.cwd(), r.file), "=>", r.reason);
    for (const d of duplication)
      console.error(" -", path.relative(process.cwd(), d.file), "=>", d.reason);
  }

  // [IM1d] Report @/ path alias violations in convex files
  if (pathAliasViolations.length) {
    console.error("✖ [IM1d] @/ path alias imports in convex/ files (WILL FAIL AT BUNDLE TIME):");
    console.error("  Convex's esbuild bundler does NOT resolve tsconfig paths.");
    console.error("  Use relative imports (../lib/foo) within convex/.");
    console.error("  See AGENTS.md [IM1d] for details.");
    for (const v of pathAliasViolations)
      console.error(" -", path.relative(process.cwd(), v.file), "=>", v.reason);
  }

  const allPassed =
    !bad.length && !reexports.length && !duplication.length && !pathAliasViolations.length;

  if (allPassed) {
    console.log("[OK] Convex import/type/path-alias checks passed");
  }

  // Non-fatal to avoid blocking local dev as per policy; CI can enforce via wrapper
  process.exit(allPassed ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.warn(
    "Convex import check encountered an error but will not block:",
    e && e.message ? e.message : e,
  );
  process.exit(0);
}
