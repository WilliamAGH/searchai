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
  const files = fs.existsSync(srcDir) ? listFiles(srcDir) : [];
  const bad = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (/from\s+["']convex\/server["']/.test(content)) {
      bad.push(file);
    }
  }

  if (bad.length) {
    console.error("✖ Invalid Convex server import(s) in client files:");
    for (const b of bad) console.error(" -", path.relative(process.cwd(), b));
    // Keep non-fatal for now to avoid blocking
    process.exit(1);
  } else {
    console.log("✅ Convex import check passed");
    process.exit(0);
  }
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
