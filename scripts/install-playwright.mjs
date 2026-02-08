/**
 * Install Playwright browser binaries.
 *
 * - CI: installs all browsers (chromium, firefox, webkit).
 * - macOS (local): installs only chromium — WebKit crashes during
 *   _RegisterApplication in headless terminal contexts.
 * - Linux (local): installs chromium + webkit.
 *
 * Override with PLAYWRIGHT_INCLUDE_WEBKIT=1 to force WebKit install.
 */
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const isCI = process.env.CI === "true";
const isMac = platform() === "darwin";
const includeWebkitEnv = process.env.PLAYWRIGHT_INCLUDE_WEBKIT;
const forceWebkitInstall =
  includeWebkitEnv === "1" || includeWebkitEnv === "true";
const disableWebkitInstall =
  includeWebkitEnv === "0" || includeWebkitEnv === "false";

const args = ["playwright", "install", "--with-deps"];

if (!isCI) {
  args.push("chromium");
  if (forceWebkitInstall || (!disableWebkitInstall && !isMac)) {
    args.push("webkit");
  }
}

execFileSync("npx", args, { stdio: "inherit" });
