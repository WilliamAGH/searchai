#!/usr/bin/env node

import { spawn } from "node:child_process";

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/lib/timeout.mjs --timeout-sec <n> --kill-after-sec <n> -- <command> [...args]",
      "",
      "Example:",
      "  node scripts/lib/timeout.mjs --timeout-sec 60 --kill-after-sec 10 -- npx convex dev --once",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  let timeoutSec;
  let killAfterSec;
  let cmdIndex = -1;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      cmdIndex = i + 1;
      break;
    }
    if (arg === "--timeout-sec") {
      const value = argv[i + 1];
      if (!value) return { ok: false, error: "Missing --timeout-sec value" };
      timeoutSec = Number(value);
      i += 1;
      continue;
    }
    if (arg === "--kill-after-sec") {
      const value = argv[i + 1];
      if (!value) return { ok: false, error: "Missing --kill-after-sec value" };
      killAfterSec = Number(value);
      i += 1;
      continue;
    }

    return { ok: false, error: `Unknown arg: ${arg}` };
  }

  if (cmdIndex === -1) return { ok: false, error: "Missing -- separator" };
  const cmd = argv[cmdIndex];
  const cmdArgs = argv.slice(cmdIndex + 1);

  if (!cmd) return { ok: false, error: "Missing command after --" };
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    return { ok: false, error: "--timeout-sec must be a positive number" };
  }
  if (!Number.isFinite(killAfterSec) || killAfterSec < 0) {
    return { ok: false, error: "--kill-after-sec must be >= 0" };
  }

  return {
    ok: true,
    timeoutMs: Math.floor(timeoutSec * 1000),
    killAfterMs: Math.floor(killAfterSec * 1000),
    cmd,
    cmdArgs,
  };
}

function killProcessTree(childPid, signal) {
  if (!childPid) return;

  const tryKill = (pid, contextLabel) => {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ESRCH"
      ) {
        return;
      }
      console.error(`[timeout] Failed to send ${signal} to ${contextLabel}`, {
        error,
      });
    }
  };

  if (process.platform === "win32") {
    tryKill(childPid, `pid ${childPid}`);
    return;
  }

  // Kill the entire process group. The spawned child is the group leader when detached.
  tryKill(-childPid, `process group ${childPid}`);
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`[timeout] ${parsed.error}`);
  printUsage();
  process.exit(2);
}

const child = spawn(parsed.cmd, parsed.cmdArgs, {
  stdio: "inherit",
  detached: true,
});

let didTimeout = false;
let timeoutTimer;
let killTimer;

timeoutTimer = setTimeout(() => {
  didTimeout = true;
  killProcessTree(child.pid, "SIGTERM");

  if (parsed.killAfterMs > 0) {
    killTimer = setTimeout(() => {
      killProcessTree(child.pid, "SIGKILL");
    }, parsed.killAfterMs);
  }
}, parsed.timeoutMs);

const clearTimers = () => {
  if (timeoutTimer) clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);
};

const forwardSignal = (signal) => {
  clearTimers();
  killProcessTree(child.pid, signal);
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  clearTimers();

  if (signal) {
    // Mirror sh(1) conventions: 128 + signal number. Since we can't portably
    // map names to numbers here, preserve a clear non-zero exit for timeouts.
    process.exit(didTimeout ? 124 : 1);
  }

  process.exit(code ?? (didTimeout ? 124 : 1));
});
