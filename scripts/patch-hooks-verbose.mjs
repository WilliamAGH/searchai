/**
 * Patches prek-generated git hook scripts to:
 * - enable verbose output
 * - write prek trace logs inside `.git/` (avoids relying on $PREK_HOME)
 *
 * prek install generates hook scripts under .git/hooks/ that hide command
 * output behind a progress spinner. This script injects `--verbose` into
 * each hook-impl invocation so stdout/stderr stream to the terminal in
 * real time — essential for diagnosing hangs in long-running hooks
 * (e.g., Convex deployment dry-run).
 *
 * Called automatically by the `prepare` script after `prek install`.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOOKS_DIR = join(process.cwd(), ".git", "hooks");
const HOOK_NAMES = ["pre-commit", "pre-push"];

for (const hookName of HOOK_NAMES) {
  const hookPath = join(HOOKS_DIR, hookName);
  if (!existsSync(hookPath)) continue;

  const content = readFileSync(hookPath, "utf8");

  const lines = content.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith('exec "$PREK" hook-impl ')) continue;

    const hasVerbose = line.includes(" hook-impl --verbose ");
    const hasLogFile = line.includes(" --log-file ");

    if (hasVerbose && hasLogFile) break;

    // Insert flags immediately after `hook-impl` to keep the invocation readable.
    const parts = line.split(" hook-impl ");
    if (parts.length !== 2) continue;

    const suffix = parts[1] ?? "";
    const flagPrefix = [
      !hasVerbose ? "--verbose" : null,
      !hasLogFile ? '--log-file "$HERE/../prek.log"' : null,
    ]
      .filter(Boolean)
      .join(" ");

    lines[i] =
      parts[0] + " hook-impl " + (flagPrefix ? `${flagPrefix} ` : "") + suffix;
    changed = true;
    break;
  }

  if (!changed) continue;

  writeFileSync(hookPath, lines.join("\n"), "utf8");
  console.log(`[patch-hooks] Patched ${hookName}`);
}
