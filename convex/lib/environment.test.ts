/**
 * Tests for Convex environment detection utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isDevDeployment,
  getDeploymentFromUrl,
  getActionEnvironment,
  isDevAction,
  isDevFromContext,
  getEnvLogger,
} from "./environment";

describe("Convex Environment Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isDevDeployment", () => {
    it("should identify known dev deployments", () => {
      expect(isDevDeployment("diligent-greyhound-240")).toBe(true);
      expect(isDevDeployment("localhost")).toBe(true);
      expect(isDevDeployment("local")).toBe(true);
    });

    it("should identify known prod deployments", () => {
      expect(isDevDeployment("vivid-boar-858")).toBe(false);
    });

    it("should handle deployment type prefixes", () => {
      expect(isDevDeployment("dev:some-deployment")).toBe(true);
      expect(isDevDeployment("prod:some-deployment")).toBe(false);
    });

    it("should handle deployments with dev/prod in name", () => {
      expect(isDevDeployment("my-dev-server")).toBe(true);
      expect(isDevDeployment("development-test")).toBe(true);
      expect(isDevDeployment("production-server")).toBe(false);
      expect(isDevDeployment("my-prod-app")).toBe(false);
    });

    it("should extract name after colon prefix", () => {
      expect(isDevDeployment("prod:diligent-greyhound-240")).toBe(true); // Known dev name wins
      expect(isDevDeployment("dev:vivid-boar-858")).toBe(false); // Known prod name wins
    });

    it("should default to production for unknown deployments", () => {
      expect(isDevDeployment("unknown-deployment")).toBe(false);
      expect(isDevDeployment("random-name-123")).toBe(false);
    });

    it("should handle undefined/empty input", () => {
      expect(isDevDeployment("")).toBe(false);
      expect(isDevDeployment("")).toBe(false);
    });
  });

  describe("getDeploymentFromUrl", () => {
    it("should extract deployment from Convex URLs", () => {
      expect(
        getDeploymentFromUrl("https://diligent-greyhound-240.convex.cloud"),
      ).toBe("diligent-greyhound-240");
      expect(
        getDeploymentFromUrl("https://vivid-boar-858.convex.cloud/api"),
      ).toBe("vivid-boar-858");
    });

    it("should handle localhost URLs", () => {
      expect(getDeploymentFromUrl("http://localhost:3000")).toBe("localhost");
      expect(getDeploymentFromUrl("http://127.0.0.1:8080")).toBe("localhost");
    });

    it("should return null for non-Convex URLs", () => {
      expect(getDeploymentFromUrl("https://example.com")).toBeNull();
      expect(getDeploymentFromUrl("https://google.com")).toBeNull();
    });

    it("should handle invalid URLs", () => {
      expect(getDeploymentFromUrl("not-a-url")).toBeNull();
      expect(getDeploymentFromUrl("")).toBeNull();
      expect(getDeploymentFromUrl("ftp://invalid.com")).toBeNull();
    });
  });

  describe("getActionEnvironment", () => {
    it("should detect development from NODE_ENV", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(getActionEnvironment()).toBe("development");
    });

    it("should detect production from NODE_ENV", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(getActionEnvironment()).toBe("production");
    });

    it("should use CONVEX_DEPLOYMENT when NODE_ENV not set", () => {
      vi.stubEnv("NODE_ENV", "");
      vi.stubEnv("CONVEX_DEPLOYMENT", "dev:diligent-greyhound-240");
      expect(getActionEnvironment()).toBe("development");

      vi.stubEnv("CONVEX_DEPLOYMENT", "prod:vivid-boar-858");
      expect(getActionEnvironment()).toBe("production");
    });

    it("should use CONVEX_URL as fallback", () => {
      vi.stubEnv("NODE_ENV", "");
      vi.stubEnv("CONVEX_DEPLOYMENT", "");
      vi.stubEnv("CONVEX_URL", "https://diligent-greyhound-240.convex.cloud");
      expect(getActionEnvironment()).toBe("development");

      vi.stubEnv("CONVEX_URL", "https://vivid-boar-858.convex.cloud");
      expect(getActionEnvironment()).toBe("production");
    });

    it("should default to production when no env vars set", () => {
      vi.stubEnv("NODE_ENV", "");
      vi.stubEnv("CONVEX_DEPLOYMENT", "");
      vi.stubEnv("CONVEX_URL", "");
      expect(getActionEnvironment()).toBe("production");
    });
  });

  describe("isDevAction", () => {
    it("should return true for development environment", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(isDevAction()).toBe(true);
    });

    it("should return false for production environment", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isDevAction()).toBe(false);
    });

    it("should use deployment fallback", () => {
      vi.stubEnv("NODE_ENV", "");
      vi.stubEnv("CONVEX_DEPLOYMENT", "diligent-greyhound-240");
      expect(isDevAction()).toBe(true);
    });
  });

  describe("isDevFromContext", () => {
    it("should use deployment hint when provided", () => {
      expect(isDevFromContext("diligent-greyhound-240")).toBe(true);
      expect(isDevFromContext("vivid-boar-858")).toBe(false);
      expect(isDevFromContext("dev:something")).toBe(true);
      expect(isDevFromContext("prod:something")).toBe(false);
    });

    it("should default to production without hint", () => {
      expect(isDevFromContext()).toBe(false);
      expect(isDevFromContext("")).toBe(false);
      expect(isDevFromContext("")).toBe(false);
    });

    it("should handle unknown deployment hints conservatively", () => {
      expect(isDevFromContext("unknown-deployment")).toBe(false);
    });
  });

  describe("getEnvLogger", () => {
    it("should return working logger when isDev is true", () => {
      const consoleSpy = {
        log: vi.spyOn(console, "info"),
        error: vi.spyOn(console, "error"),
        warn: vi.spyOn(console, "warn"),
      };

      const logger = getEnvLogger(true);

      logger.log("test log");
      logger.error("test error");
      logger.warn("test warn");
      logger.debug("test debug");

      expect(consoleSpy.log).toHaveBeenCalledWith("test log");
      expect(consoleSpy.error).toHaveBeenCalledWith("test error");
      expect(consoleSpy.warn).toHaveBeenCalledWith("test warn");
      expect(consoleSpy.log).toHaveBeenCalledWith("[DEBUG]", "test debug");
    });

    it("should return no-op logger when isDev is false", () => {
      const consoleSpy = {
        log: vi.spyOn(console, "info"),
        error: vi.spyOn(console, "error"),
        warn: vi.spyOn(console, "warn"),
      };

      const logger = getEnvLogger(false);

      logger.log("test log");
      logger.error("test error");
      logger.warn("test warn");
      logger.debug("test debug");

      // No console methods should be called
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it("should not throw when logger methods are called", () => {
      const logger = getEnvLogger(false);

      expect(() => logger.log("test")).not.toThrow();
      expect(() => logger.error("test")).not.toThrow();
      expect(() => logger.warn("test")).not.toThrow();
      expect(() => logger.debug("test")).not.toThrow();
    });
  });

  describe("Integration scenarios", () => {
    it("should handle typical action environment", () => {
      // Simulate typical Convex action environment
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("CONVEX_DEPLOYMENT", "dev:diligent-greyhound-240");

      expect(isDevAction()).toBe(true);
      expect(getActionEnvironment()).toBe("development");
    });

    it("should handle typical production action", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CONVEX_DEPLOYMENT", "prod:vivid-boar-858");

      expect(isDevAction()).toBe(false);
      expect(getActionEnvironment()).toBe("production");
    });

    it("should handle query/mutation context", () => {
      // Queries/mutations can't access process.env
      // Simulate by not setting any env vars
      vi.stubEnv("NODE_ENV", "");
      vi.stubEnv("CONVEX_DEPLOYMENT", "");

      // Should use hardcoded knowledge or hints
      expect(isDevFromContext()).toBe(false); // Safe default
      expect(isDevFromContext("diligent-greyhound-240")).toBe(true);
    });
  });
});
