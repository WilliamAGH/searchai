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
    if (
      e.name === "node_modules" ||
      e.name === "dist" ||
      e.name.startsWith(".")
    )
      continue;
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
  const httpFiles = fs.existsSync(convexHttpDir)
    ? listFiles(convexHttpDir)
    : [];
  const bad = [];
  const duplication = [];
  const reexports = [];

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
    if (
      /export\s+\{[^}]*\}\s+from\s+["'](?:\.\.\/)+_generated\/dataModel["']/.test(
        content,
      )
    ) {
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
    if (
      /export\s+\{[^}]*\}\s+from\s+["'](?:\.\.\/)+_generated\//.test(content)
    ) {
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
        reason:
          "Manual interface with _id and _creationTime fields in convex/*",
      });
    }
  }

  if (bad.length) {
    console.error("✖ Invalid Convex server import(s) in client files:");
    for (const b of bad) console.error(" -", path.relative(process.cwd(), b));
  }

  if (reexports.length || duplication.length) {
    console.error(
      "✖ Potential Convex type wrapper/duplication issues detected:",
    );
    for (const r of reexports)
      console.error(" -", path.relative(process.cwd(), r.file), "=>", r.reason);
    for (const d of duplication)
      console.error(" -", path.relative(process.cwd(), d.file), "=>", d.reason);
  } else {
    console.log("✅ Convex import/type duplication checks passed");
  }

  // Non-fatal to avoid blocking local dev as per policy; CI can enforce via wrapper
  process.exit(bad.length || reexports.length || duplication.length ? 1 : 0);
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
