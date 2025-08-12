/**
 * Environment variable validation and type safety
 * Ensures all required env vars are present and valid
 */

interface EnvConfig {
  VITE_CONVEX_URL: string;
  DEV: boolean;
  PROD: boolean;
  MODE: "development" | "production" | "test";
}

/**
 * Validate and parse environment variables
 * Throws error if required variables are missing
 */
function validateEnv(): EnvConfig {
  const env = import.meta.env;

  // Required variables
  if (!env.VITE_CONVEX_URL) {
    throw new Error("Missing required environment variable: VITE_CONVEX_URL");
  }

  // Validate Convex URL format
  try {
    const url = new URL(env.VITE_CONVEX_URL);
    if (
      !url.hostname.includes("convex.cloud") &&
      !url.hostname.includes("localhost")
    ) {
      console.warn(
        "VITE_CONVEX_URL does not appear to be a valid Convex URL:",
        env.VITE_CONVEX_URL,
      );
    }
  } catch {
    throw new Error(`Invalid VITE_CONVEX_URL format: ${env.VITE_CONVEX_URL}`);
  }

  return {
    VITE_CONVEX_URL: env.VITE_CONVEX_URL,
    DEV: env.DEV === true,
    PROD: env.PROD === true,
    MODE: env.MODE as "development" | "production" | "test",
  };
}

/**
 * Cached environment configuration
 * Validates once on first access
 */
let _envCache: EnvConfig | null = null;

/**
 * Get validated environment configuration
 * @throws Error if required environment variables are missing
 */
export function getEnv(): EnvConfig {
  if (!_envCache) {
    _envCache = validateEnv();
  }
  return _envCache;
}

/**
 * Safe environment getters with defaults
 */
export const env = {
  get convexUrl(): string {
    try {
      return getEnv().VITE_CONVEX_URL;
    } catch {
      // Fallback for local development and local preview/testing environments
      const isLocalHost =
        typeof window !== "undefined" &&
        (window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "localhost");
      if (import.meta.env.DEV || isLocalHost) {
        console.warn("Using fallback Convex URL for local environment");
        return "https://diligent-greyhound-240.convex.cloud";
      }
      throw new Error("VITE_CONVEX_URL is required");
    }
  },

  get isDev(): boolean {
    return import.meta.env.DEV === true;
  },

  get isProd(): boolean {
    return import.meta.env.PROD === true;
  },

  get mode(): string {
    return import.meta.env.MODE || "development";
  },

  /**
   * Check if all required environment variables are present
   */
  validate(): boolean {
    try {
      getEnv();
      return true;
    } catch (e) {
      console.error("Environment validation failed:", e);
      return false;
    }
  },

  /**
   * Get validation errors if any
   */
  getValidationErrors(): string[] {
    const errors: string[] = [];

    if (!import.meta.env.VITE_CONVEX_URL) {
      errors.push("VITE_CONVEX_URL is not defined");
    }

    try {
      if (import.meta.env.VITE_CONVEX_URL) {
        new URL(import.meta.env.VITE_CONVEX_URL);
      }
    } catch {
      errors.push("VITE_CONVEX_URL is not a valid URL");
    }

    return errors;
  },
};

/**
 * Initialize environment validation
 * Call this early in app startup
 */
export function initializeEnv(): void {
  const errors = env.getValidationErrors();

  if (errors.length > 0) {
    console.error("Environment configuration errors:");
    errors.forEach((err) => console.error(`  - ${err}`));
    // Permit local preview/test to proceed with fallbacks even in production builds
    const isLocalHost = (() => {
      try {
        return (
          typeof window !== "undefined" &&
          (window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "localhost")
        );
      } catch {
        return false;
      }
    })();

    if (env.isProd && !isLocalHost) {
      // In production on a non-local host, throw to prevent startup with bad config
      throw new Error("Invalid environment configuration");
    }
    // Otherwise (dev or local preview), warn but continue
    console.warn(
      "Continuing with invalid environment configuration (local/dev mode)",
    );
  } else {
    console.info("✅ Environment configuration validated");
  }
}
