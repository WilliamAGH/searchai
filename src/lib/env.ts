/**
 * Environment variable validation and type safety
 * Ensures all required env vars are present and valid
 */
import { logger } from "./logger";

interface EnvConfig {
  // Required
  VITE_CONVEX_URL: string;
  DEV: boolean;
  PROD: boolean;
  MODE: "development" | "production" | "test";
  
  // Optional services
  VITE_OPENROUTER_API_KEY?: string;
  VITE_SERP_API_KEY?: string;
  VITE_RESEND_API_KEY?: string;
  VITE_OPENAI_API_KEY?: string;
  VITE_OPENAI_BASE_URL?: string;
  
  // Feature flags
  VITE_ENABLE_ANALYTICS?: boolean;
  VITE_ENABLE_DEBUG?: boolean;
  VITE_ENABLE_TELEMETRY?: boolean;
  
  // URLs
  VITE_SITE_URL?: string;
  VITE_SITE_TITLE?: string;
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
      logger.warn(
        "VITE_CONVEX_URL does not appear to be a valid Convex URL:",
        env.VITE_CONVEX_URL,
      );
    }
  } catch {
    throw new Error(`Invalid VITE_CONVEX_URL format: ${env.VITE_CONVEX_URL}`);
  }

  // Validate optional URLs
  if (env.VITE_OPENAI_BASE_URL) {
    try {
      new URL(env.VITE_OPENAI_BASE_URL);
    } catch {
      logger.warn(`Invalid VITE_OPENAI_BASE_URL format: ${env.VITE_OPENAI_BASE_URL}`);
    }
  }
  
  if (env.VITE_SITE_URL) {
    try {
      new URL(env.VITE_SITE_URL);
    } catch {
      logger.warn(`Invalid VITE_SITE_URL format: ${env.VITE_SITE_URL}`);
    }
  }
  
  // Check for API key security
  const apiKeys = [
    { name: 'VITE_OPENROUTER_API_KEY', value: env.VITE_OPENROUTER_API_KEY },
    { name: 'VITE_SERP_API_KEY', value: env.VITE_SERP_API_KEY },
    { name: 'VITE_RESEND_API_KEY', value: env.VITE_RESEND_API_KEY },
    { name: 'VITE_OPENAI_API_KEY', value: env.VITE_OPENAI_API_KEY },
  ];
  
  for (const { name, value } of apiKeys) {
    if (value && value.length < 10) {
      logger.warn(`${name} appears to be invalid (too short)`);
    }
    if (value && value.includes(' ')) {
      logger.warn(`${name} contains spaces, which is likely invalid`);
    }
  }
  
  return {
    // Required
    VITE_CONVEX_URL: env.VITE_CONVEX_URL,
    DEV: env.DEV === true,
    PROD: env.PROD === true,
    MODE: env.MODE as "development" | "production" | "test",
    
    // Optional services
    VITE_OPENROUTER_API_KEY: env.VITE_OPENROUTER_API_KEY,
    VITE_SERP_API_KEY: env.VITE_SERP_API_KEY,
    VITE_RESEND_API_KEY: env.VITE_RESEND_API_KEY,
    VITE_OPENAI_API_KEY: env.VITE_OPENAI_API_KEY,
    VITE_OPENAI_BASE_URL: env.VITE_OPENAI_BASE_URL,
    
    // Feature flags
    VITE_ENABLE_ANALYTICS: env.VITE_ENABLE_ANALYTICS === 'true',
    VITE_ENABLE_DEBUG: env.VITE_ENABLE_DEBUG === 'true',
    VITE_ENABLE_TELEMETRY: env.VITE_ENABLE_TELEMETRY === 'true',
    
    // URLs
    VITE_SITE_URL: env.VITE_SITE_URL,
    VITE_SITE_TITLE: env.VITE_SITE_TITLE || 'SearchAI',
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
        logger.warn("Using fallback Convex URL for local environment");
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
  
  // Optional service getters
  get openRouterApiKey(): string | undefined {
    return getEnv().VITE_OPENROUTER_API_KEY;
  },
  
  get serpApiKey(): string | undefined {
    return getEnv().VITE_SERP_API_KEY;
  },
  
  get openAiApiKey(): string | undefined {
    return getEnv().VITE_OPENAI_API_KEY;
  },
  
  get openAiBaseUrl(): string | undefined {
    return getEnv().VITE_OPENAI_BASE_URL;
  },
  
  // Feature flags
  get enableAnalytics(): boolean {
    return getEnv().VITE_ENABLE_ANALYTICS || false;
  },
  
  get enableDebug(): boolean {
    return getEnv().VITE_ENABLE_DEBUG || false;
  },
  
  get enableTelemetry(): boolean {
    return getEnv().VITE_ENABLE_TELEMETRY || false;
  },
  
  // Site configuration
  get siteUrl(): string | undefined {
    return getEnv().VITE_SITE_URL;
  },
  
  get siteTitle(): string {
    return getEnv().VITE_SITE_TITLE || 'SearchAI';
  },

  /**
   * Check if all required environment variables are present
   */
  validate(): boolean {
    try {
      getEnv();
      return true;
    } catch (e) {
      logger.error("Environment validation failed:", e);
      return false;
    }
  },

  /**
   * Get validation errors if any
   */
  getValidationErrors(): string[] {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required variables
    if (!import.meta.env.VITE_CONVEX_URL) {
      errors.push("VITE_CONVEX_URL is not defined");
    }

    // Validate URLs
    try {
      if (import.meta.env.VITE_CONVEX_URL) {
        new URL(import.meta.env.VITE_CONVEX_URL);
      }
    } catch {
      errors.push("VITE_CONVEX_URL is not a valid URL");
    }
    
    // Check for at least one AI service
    const hasAI = import.meta.env.VITE_OPENROUTER_API_KEY || 
                  import.meta.env.VITE_OPENAI_API_KEY;
    if (!hasAI) {
      warnings.push("No AI service API key configured (VITE_OPENROUTER_API_KEY or VITE_OPENAI_API_KEY)");
    }
    
    // Check for search service
    const hasSearch = import.meta.env.VITE_SERP_API_KEY;
    if (!hasSearch) {
      warnings.push("No search API key configured (VITE_SERP_API_KEY) - falling back to limited search");
    }
    
    // Log warnings
    if (warnings.length > 0) {
      logger.warn("Environment configuration warnings:");
      warnings.forEach(w => logger.warn(`  ⚠ ${w}`));
    }

    return errors;
  },
  
  /**
   * Get service availability
   */
  getServiceAvailability(): {
    convex: boolean;
    openrouter: boolean;
    openai: boolean;
    serpapi: boolean;
    email: boolean;
  } {
    return {
      convex: !!import.meta.env.VITE_CONVEX_URL,
      openrouter: !!import.meta.env.VITE_OPENROUTER_API_KEY,
      openai: !!import.meta.env.VITE_OPENAI_API_KEY,
      serpapi: !!import.meta.env.VITE_SERP_API_KEY,
      email: !!import.meta.env.VITE_RESEND_API_KEY,
    };
  },
};

/**
 * Initialize environment validation
 * Call this early in app startup
 */
export function initializeEnv(): void {
  const errors = env.getValidationErrors();
  const availability = env.getServiceAvailability();

  // Log service availability
  logger.info("Service availability:", availability);

  if (errors.length > 0) {
    logger.error("Environment configuration errors:");
    errors.forEach((err) => logger.error(`  ✗ ${err}`));
    
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
    logger.warn(
      "Continuing with invalid environment configuration (local/dev mode)",
    );
  } else {
    logger.info("✅ Environment configuration validated");
    
    // Log configured services
    const configuredServices = [];
    if (availability.openrouter) configuredServices.push('OpenRouter');
    if (availability.openai) configuredServices.push('OpenAI');
    if (availability.serpapi) configuredServices.push('SERP API');
    if (availability.email) configuredServices.push('Email (Resend)');
    
    if (configuredServices.length > 0) {
      logger.info(`✅ Configured services: ${configuredServices.join(', ')}`);
    } else {
      logger.warn('⚠ No optional services configured - running with limited functionality');
    }
  }
}

/**
 * Export environment details for debugging
 * Redacts sensitive values
 */
export function getEnvironmentInfo(): Record<string, any> {
  const availability = env.getServiceAvailability();
  
  return {
    mode: env.mode,
    isDev: env.isDev,
    isProd: env.isProd,
    convexUrl: env.convexUrl,
    services: availability,
    features: {
      analytics: env.enableAnalytics,
      debug: env.enableDebug,
      telemetry: env.enableTelemetry,
    },
    site: {
      url: env.siteUrl,
      title: env.siteTitle,
    },
    // Redacted API keys (show only if configured)
    apiKeys: {
      openrouter: availability.openrouter ? '[REDACTED]' : 'not configured',
      openai: availability.openai ? '[REDACTED]' : 'not configured',
      serpapi: availability.serpapi ? '[REDACTED]' : 'not configured',
      email: availability.email ? '[REDACTED]' : 'not configured',
    },
  };
}
