/**
 * Shared browser inclusion flags for Playwright configs.
 *
 * WebKit on macOS crashes during _RegisterApplication (SIGABRT) when
 * launched in headless terminal contexts. Each crash spawns a macOS crash
 * dialog, so retries make it worse. Skip WebKit on local macOS; CI (Linux)
 * runs it safely. Override with PLAYWRIGHT_INCLUDE_WEBKIT=1 if needed.
 */

const includeWebkitEnv = process.env.PLAYWRIGHT_INCLUDE_WEBKIT;

export const includeWebkit =
  includeWebkitEnv === "1" ||
  includeWebkitEnv === "true" ||
  (process.platform !== "darwin" && includeWebkitEnv !== "0");

const includeFirefoxEnv = process.env.PLAYWRIGHT_INCLUDE_FIREFOX;

export const includeFirefox =
  includeFirefoxEnv === "1" ||
  includeFirefoxEnv === "true" ||
  (process.env.CI === "true" &&
    includeFirefoxEnv !== "0" &&
    includeFirefoxEnv !== "false");
