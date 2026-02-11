/**
 * Patches prek-generated git hook scripts to enable verbose output.
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

  // Already patched — skip
  if (content.includes("--verbose")) continue;

  // Insert --verbose before --hook-dir in the prek hook-impl exec line
  const patched = content.replace(
    /hook-impl\s+--hook-dir/,
    "hook-impl --verbose --hook-dir",
  );

  if (patched === content) {
    console.warn(
      `[patch-hooks] Could not find hook-impl pattern in ${hookName}, skipping`,
    );
    continue;
  }

  writeFileSync(hookPath, patched, "utf8");
  console.log(`[patch-hooks] Patched ${hookName} with --verbose`);
}
