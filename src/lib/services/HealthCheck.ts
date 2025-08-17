/**
 * Health Check Utilities
 * Provides health checking functionality for services
 */

import { serviceRegistry } from "./ServiceConfig";
import { logger } from "../logger";

export interface HealthCheckResult {
  service: string;
  healthy: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
  timestamp: Date;
}

/**
 * Health Check Manager
 * Manages health checks for all registered services
 */
export class HealthCheckManager {
  private static instance: HealthCheckManager;
  private isMonitoring: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): HealthCheckManager {
    if (!HealthCheckManager.instance) {
      HealthCheckManager.instance = new HealthCheckManager();
    }
    return HealthCheckManager.instance;
  }

  /**
   * Start monitoring all services
   */
  startMonitoring(intervalMs: number = 60000) {
    if (this.isMonitoring) {
      logger.warn("Health monitoring already started");
      return;
    }

    this.isMonitoring = true;
    logger.info("Starting health monitoring", { intervalMs });

    // Perform immediate check
    this.checkAllServices();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllServices();
    }, intervalMs);
  }

  /**
   * Stop monitoring all services
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    serviceRegistry.stopAllHealthChecks();
    logger.info("Health monitoring stopped");
  }

  /**
   * Check health of all registered services
   */
  async checkAllServices(): Promise<HealthCheckResult[]> {
    const services = serviceRegistry.getAllServices();
    const results: HealthCheckResult[] = [];

    const checkPromises = services.map(async (service) => {
      try {
        const result = await this.checkService(service.name);
        results.push(result);
        return result;
      } catch (error) {
        const errorResult: HealthCheckResult = {
          service: service.name,
          healthy: false,
          responseTime: 0,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date(),
        };
        results.push(errorResult);
        return errorResult;
      }
    });

    await Promise.all(checkPromises);

    // Log system health summary
    const systemHealth = serviceRegistry.getSystemHealth();
    logger.info("System health check completed", systemHealth);

    return results;
  }

  /**
   * Check health of a specific service
   */
  async checkService(serviceName: string): Promise<HealthCheckResult> {
    const config = serviceRegistry.getService(serviceName);
    if (!config) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    const startTime = Date.now();
    const result: HealthCheckResult = {
      service: serviceName,
      healthy: false,
      responseTime: 0,
      timestamp: new Date(),
    };

    try {
      // Special handling for different services
      switch (serviceName) {
        case "convex":
          result.healthy = await this.checkConvex(config.baseUrl);
          break;
        case "openrouter":
          result.healthy = await this.checkOpenRouter();
          break;
        case "serpapi":
          result.healthy = await this.checkSerpApi();
          break;
        case "duckduckgo":
          result.healthy = await this.checkDuckDuckGo();
          break;
        default:
          // Generic health check
          if (config.healthCheckEndpoint) {
            const response = await this.performHttpCheck(
              `${config.baseUrl}${config.healthCheckEndpoint}`,
              config.timeout,
            );
            result.healthy = response.ok;
            result.statusCode = response.status;
          } else {
            result.healthy = true; // Assume healthy if no check endpoint
          }
      }

      result.responseTime = Date.now() - startTime;

      // Update service health in registry
      serviceRegistry.updateServiceHealth(
        serviceName,
        result.healthy ? "healthy" : "unhealthy",
        result.responseTime,
        { statusCode: result.statusCode },
      );

      return result;
    } catch (error) {
      result.responseTime = Date.now() - startTime;
      result.error = error instanceof Error ? error.message : "Unknown error";
      result.healthy = false;

      serviceRegistry.updateServiceHealth(
        serviceName,
        "unhealthy",
        result.responseTime,
        { error: result.error },
      );

      return result;
    }
  }

  /**
   * Check Convex backend health
   */
  private async checkConvex(baseUrl: string): Promise<boolean> {
    if (!baseUrl) {
      logger.error("Convex URL not configured");
      return false;
    }

    try {
      const response = await this.performHttpCheck(
        `${baseUrl}/api/health`,
        5000,
      );
      return response.ok;
    } catch (error) {
      logger.error("Convex health check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Check OpenRouter API health
   */
  private async checkOpenRouter(): Promise<boolean> {
    // Check if API key is configured
    const hasApiKey = !!import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!hasApiKey) {
      logger.debug("OpenRouter API key not configured");
      return false;
    }

    try {
      // Just check if the API is reachable
      const response = await this.performHttpCheck(
        "https://openrouter.ai/api/v1/models",
        10000,
      );
      return response.status === 200 || response.status === 401; // 401 is ok, means API is up
    } catch (error) {
      logger.error("OpenRouter health check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Check SERP API health
   */
  private async checkSerpApi(): Promise<boolean> {
    // Check if API key is configured
    const hasApiKey = !!import.meta.env.VITE_SERP_API_KEY;
    if (!hasApiKey) {
      logger.debug("SERP API key not configured");
      return false;
    }

    try {
      const response = await this.performHttpCheck(
        "https://serpapi.com/account",
        5000,
      );
      return response.status === 200 || response.status === 401; // 401 is ok, means API is up
    } catch (error) {
      logger.error("SERP API health check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Check DuckDuckGo API health
   */
  private async checkDuckDuckGo(): Promise<boolean> {
    try {
      const response = await this.performHttpCheck(
        "https://api.duckduckgo.com/?q=test&format=json&no_html=1",
        5000,
      );
      return response.ok;
    } catch (error) {
      logger.error("DuckDuckGo health check failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Perform HTTP health check
   */
  private async performHttpCheck(
    url: string,
    timeout: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get current system health status
   */
  getSystemStatus(): {
    status: "healthy" | "degraded" | "critical";
    services: Array<{
      name: string;
      status: string;
      responseTime?: number;
      lastCheck: Date;
    }>;
    message: string;
  } {
    const systemHealth = serviceRegistry.getSystemHealth();
    const services = serviceRegistry.getAllServiceHealth();

    let message: string;
    switch (systemHealth.status) {
      case "healthy":
        message = "All services are operational";
        break;
      case "degraded":
        message = "Some services are experiencing issues";
        break;
      case "critical":
        message = "Critical services are unavailable";
        break;
      default:
        message = "System status unknown";
    }

    return {
      status: systemHealth.status,
      services: services.map((s) => ({
        name: s.service,
        status: s.status,
        responseTime: s.responseTime,
        lastCheck: s.lastCheck,
      })),
      message,
    };
  }

  /**
   * Wait for critical services to be healthy
   */
  async waitForCriticalServices(maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second

    while (Date.now() - startTime < maxWaitMs) {
      await this.checkAllServices();
      const systemHealth = serviceRegistry.getSystemHealth();

      if (systemHealth.requiredServicesHealthy) {
        logger.info("All critical services are healthy");
        return true;
      }

      logger.info("Waiting for critical services...", {
        elapsed: Date.now() - startTime,
        maxWait: maxWaitMs,
      });

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    logger.error("Critical services did not become healthy in time", {
      timeoutMs: maxWaitMs,
    });
    return false;
  }
}

// Export singleton instance
export const healthCheckManager = HealthCheckManager.getInstance();
