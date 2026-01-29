import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 350;

const GENERATED_EXACT_PATHS = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const GENERATED_PATH_PREFIXES = [
  "convex/_generated/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "out/",
];

function listTrackedFiles() {
  const stdout = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  return stdout.split("\0").filter(Boolean);
}

function isGeneratedPath(repoPath) {
  if (GENERATED_EXACT_PATHS.has(repoPath)) return true;
  return GENERATED_PATH_PREFIXES.some((prefix) => repoPath.startsWith(prefix));
}

function isProbablyBinary(buffer) {
  return buffer.includes(0);
}

function countLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

const trackedFiles = listTrackedFiles();
const violations = [];

for (const repoPath of trackedFiles) {
  if (isGeneratedPath(repoPath)) continue;

  let buffer;
  try {
    buffer = readFileSync(repoPath);
  } catch {
    continue;
  }

  if (isProbablyBinary(buffer)) continue;

  const lineCount = countLines(buffer.toString("utf8"));
  if (lineCount > MAX_LINES) violations.push({ repoPath, lineCount });
}

if (violations.length > 0) {
  const sorted = [...violations].sort((a, b) => b.lineCount - a.lineCount);
  for (const v of sorted) {
    process.stdout.write(
      `${String(v.lineCount).padStart(5, " ")}  ${v.repoPath}\n`,
    );
  }

  process.stdout.write(
    `\nLOC limit: ${MAX_LINES} lines (tracked, non-generated files)\n` +
      `Violations: ${violations.length}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `OK: ${trackedFiles.length} tracked files, 0 LOC violations (limit ${MAX_LINES})\n`,
  );
}
