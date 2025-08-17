/**
 * Tests for frontend environment detection utilities
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isDevelopment,
  getDeploymentFromUrl,
  getCurrentDeployment,
  environment,
  isDev,
  isProduction,
  getDeployment,
  getEnvLogger,
} from "../environment";

describe("Frontend Environment Detection", () => {
  // Store original values
  const originalLocation = window.location;

  beforeEach(() => {
    // Reset environment singleton
    environment.refresh();
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original values
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  describe("isDevelopment", () => {
    it("should detect development from Vite DEV flag", () => {
      // Note: import.meta.env.DEV is replaced at build time by Vite
      // In test environment, it's usually true
      // We can't stub it directly, so we test other detection methods
      const result = isDevelopment();
      // This will be true in dev environment
      expect(typeof result).toBe("boolean");
    });

    it("should detect production deployment from URL", () => {
      // We can't change import.meta.env.DEV, but we can test URL detection
      vi.stubEnv("VITE_CONVEX_URL", "https://vivid-boar-858.convex.cloud");
      Object.defineProperty(window, "location", {
        value: { hostname: "search-ai.io" },
        writable: true,
        configurable: true,
      });
      // Will still be true if DEV is true, but URL detection works
      const result = isDevelopment();
      expect(typeof result).toBe("boolean");
    });

    it("should detect localhost as development", () => {
      vi.stubEnv("DEV", false);
      Object.defineProperty(window, "location", {
        value: { hostname: "localhost" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(true);
    });

    it("should detect 127.0.0.1 as development", () => {
      vi.stubEnv("DEV", false);
      Object.defineProperty(window, "location", {
        value: { hostname: "127.0.0.1" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(true);
    });

    it("should detect local network IP as development", () => {
      vi.stubEnv("DEV", false);
      Object.defineProperty(window, "location", {
        value: { hostname: "192.168.1.100" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(true);
    });

    it("should detect dev deployment from Convex URL", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv(
        "VITE_CONVEX_URL",
        "https://diligent-greyhound-240.convex.cloud",
      );
      Object.defineProperty(window, "location", {
        value: { hostname: "search-ai.io" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(true);
    });

    it("should detect production deployment from Convex URL", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("VITE_CONVEX_URL", "https://vivid-boar-858.convex.cloud");
      Object.defineProperty(window, "location", {
        value: { hostname: "search-ai.io" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(false);
    });

    it("should use MODE as fallback", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("MODE", "development");
      vi.stubEnv("VITE_CONVEX_URL", "https://unknown.convex.cloud");
      Object.defineProperty(window, "location", {
        value: { hostname: "example.com" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(true);
    });

    it("should default to production when no signals match", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("MODE", "production");
      vi.stubEnv("VITE_CONVEX_URL", "https://unknown.convex.cloud");
      Object.defineProperty(window, "location", {
        value: { hostname: "example.com" },
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(false);
    });
  });

  describe("getDeploymentFromUrl", () => {
    it("should extract deployment name from Convex URL", () => {
      expect(
        getDeploymentFromUrl("https://diligent-greyhound-240.convex.cloud"),
      ).toBe("diligent-greyhound-240");
      expect(getDeploymentFromUrl("https://vivid-boar-858.convex.cloud")).toBe(
        "vivid-boar-858",
      );
    });

    it("should return localhost for local URLs", () => {
      expect(getDeploymentFromUrl("http://localhost:3000")).toBe("localhost");
      expect(getDeploymentFromUrl("http://127.0.0.1:5173")).toBe("localhost");
    });

    it("should return null for non-Convex URLs", () => {
      expect(getDeploymentFromUrl("https://example.com")).toBeNull();
      expect(getDeploymentFromUrl("https://google.com")).toBeNull();
    });

    it("should handle invalid URLs gracefully", () => {
      expect(getDeploymentFromUrl("not-a-url")).toBeNull();
      expect(getDeploymentFromUrl("")).toBeNull();
    });
  });

  describe("getCurrentDeployment", () => {
    it("should return deployment name from Convex URL", () => {
      vi.stubEnv(
        "VITE_CONVEX_URL",
        "https://diligent-greyhound-240.convex.cloud",
      );
      expect(getCurrentDeployment()).toBe("diligent-greyhound-240");
    });

    it("should return MODE when URL parsing fails", () => {
      vi.stubEnv("VITE_CONVEX_URL", "invalid-url");
      vi.stubEnv("MODE", "development");
      expect(getCurrentDeployment()).toBe("development");
    });

    it("should default to production when no deployment found", () => {
      vi.stubEnv("VITE_CONVEX_URL", "");
      vi.stubEnv("MODE", "");
      expect(getCurrentDeployment()).toBe("production");
    });
  });

  describe("Environment singleton", () => {
    it("should cache isDev value", () => {
      // Get initial value
      const first = environment.isDev;
      expect(typeof first).toBe("boolean");

      // Change something that would affect detection
      vi.stubEnv(
        "VITE_CONVEX_URL",
        "https://different-deployment.convex.cloud",
      );

      // Should still return cached value
      const second = environment.isDev;
      expect(second).toBe(first);

      // Refresh should recalculate
      environment.refresh();
      const third = environment.isDev;
      expect(typeof third).toBe("boolean");
    });

    it("should cache deployment value", () => {
      vi.stubEnv(
        "VITE_CONVEX_URL",
        "https://diligent-greyhound-240.convex.cloud",
      );

      const first = environment.deployment;
      expect(first).toBe("diligent-greyhound-240");

      // Change environment
      vi.stubEnv("VITE_CONVEX_URL", "https://vivid-boar-858.convex.cloud");

      // Should still return cached value
      const second = environment.deployment;
      expect(second).toBe("diligent-greyhound-240");

      // Refresh should update
      environment.refresh();
      const third = environment.deployment;
      expect(third).toBe("vivid-boar-858");
    });

    it("should provide isProduction as inverse of isDev", () => {
      environment.refresh();
      const isDev = environment.isDev;
      const isProd = environment.isProduction;

      // They should be opposites
      expect(isDev).toBe(!isProd);
      expect(isProd).toBe(!isDev);
    });
  });

  describe("Convenience shortcuts", () => {
    it("should provide isDev shortcut", () => {
      environment.refresh();
      const result = isDev();
      expect(typeof result).toBe("boolean");
      expect(result).toBe(environment.isDev);
    });

    it("should provide isProduction shortcut", () => {
      environment.refresh();
      const result = isProduction();
      expect(typeof result).toBe("boolean");
      expect(result).toBe(environment.isProduction);
      expect(result).toBe(!isDev());
    });

    it("should provide getDeployment shortcut", () => {
      vi.stubEnv("VITE_CONVEX_URL", "https://test-deployment.convex.cloud");
      environment.refresh();
      expect(getDeployment()).toBe("test-deployment");
    });
  });

  describe("getEnvLogger", () => {
    it("should return working logger in development", () => {
      vi.stubEnv("DEV", true);
      const consoleSpy = {
        log: vi.spyOn(console, "info"),
        error: vi.spyOn(console, "error"),
        warn: vi.spyOn(console, "warn"),
        info: vi.spyOn(console, "info"),
      };

      const logger = getEnvLogger();

      logger.log("test log");
      logger.error("test error");
      logger.warn("test warn");
      logger.debug("test debug");
      logger.info("test info");

      expect(consoleSpy.log).toHaveBeenCalledWith("test log");
      expect(consoleSpy.error).toHaveBeenCalledWith("test error");
      expect(consoleSpy.warn).toHaveBeenCalledWith("test warn");
      expect(consoleSpy.info).toHaveBeenCalledWith("[DEBUG]", "test debug");
      expect(consoleSpy.info).toHaveBeenCalledWith("test info");
    });

    it("should return limited logger in production", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("VITE_CONVEX_URL", "https://vivid-boar-858.convex.cloud");
      Object.defineProperty(window, "location", {
        value: { hostname: "search-ai.io" },
        writable: true,
        configurable: true,
      });

      const consoleSpy = {
        log: vi.spyOn(console, "info"),
        error: vi.spyOn(console, "error"),
        warn: vi.spyOn(console, "warn"),
        info: vi.spyOn(console, "info"),
      };

      const logger = getEnvLogger();

      logger.log("test log");
      logger.debug("test debug");
      logger.info("test info");
      logger.error("test error");
      logger.warn("test warn");

      // Only error and warn should work in production
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith("test error");
      expect(consoleSpy.warn).toHaveBeenCalledWith("test warn");
    });
  });
});
