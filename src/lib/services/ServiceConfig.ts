/**
 * Service Configuration & Health Monitoring
 * Centralized service configuration with health status tracking
 */

import { logger } from '../logger';

export interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  required: boolean;
  healthCheckEndpoint?: string;
  healthCheckInterval?: number;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  errorCount: number;
  consecutiveFailures: number;
  details?: Record<string, any>;
}

/**
 * Service Configuration Registry
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Map<string, ServiceConfig> = new Map();
  private healthStatus: Map<string, ServiceHealth> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.initializeDefaultServices();
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Initialize default service configurations
   */
  private initializeDefaultServices() {
    // Convex Backend
    this.registerService({
      name: 'convex',
      baseUrl: import.meta.env.VITE_CONVEX_URL || '',
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
      required: true,
      healthCheckEndpoint: '/api/health',
      healthCheckInterval: 60000, // 1 minute
    });

    // AI Service (OpenRouter)
    this.registerService({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai',
      timeout: 90000,
      retryCount: 2,
      retryDelay: 2000,
      required: false,
      healthCheckEndpoint: '/api/v1/models',
      healthCheckInterval: 300000, // 5 minutes
    });

    // Search Service (SERP API)
    this.registerService({
      name: 'serpapi',
      baseUrl: 'https://serpapi.com',
      timeout: 15000,
      retryCount: 2,
      retryDelay: 1000,
      required: false,
      healthCheckEndpoint: '/account',
      healthCheckInterval: 300000, // 5 minutes
    });

    // DuckDuckGo Search
    this.registerService({
      name: 'duckduckgo',
      baseUrl: 'https://api.duckduckgo.com',
      timeout: 10000,
      retryCount: 3,
      retryDelay: 500,
      required: false,
      healthCheckInterval: 300000, // 5 minutes
    });
  }

  /**
   * Register a new service configuration
   */
  registerService(config: ServiceConfig) {
    this.services.set(config.name, config);
    
    // Initialize health status
    this.healthStatus.set(config.name, {
      service: config.name,
      status: 'unknown',
      lastCheck: new Date(),
      errorCount: 0,
      consecutiveFailures: 0,
    });

    // Start health check if configured
    if (config.healthCheckInterval && config.healthCheckEndpoint) {
      this.startHealthCheck(config.name);
    }

    logger.info(`Service registered: ${config.name}`, {
      baseUrl: config.baseUrl,
      required: config.required,
    });
  }

  /**
   * Get service configuration
   */
  getService(name: string): ServiceConfig | undefined {
    return this.services.get(name);
  }

  /**
   * Get all registered services
   */
  getAllServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }

  /**
   * Get service health status
   */
  getServiceHealth(name: string): ServiceHealth | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * Get all service health statuses
   */
  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    healthy: number;
    degraded: number;
    unhealthy: number;
    requiredServicesHealthy: boolean;
  } {
    const statuses = this.getAllServiceHealth();
    const healthy = statuses.filter(s => s.status === 'healthy').length;
    const degraded = statuses.filter(s => s.status === 'degraded').length;
    const unhealthy = statuses.filter(s => s.status === 'unhealthy').length;

    // Check if all required services are healthy
    const requiredServicesHealthy = Array.from(this.services.entries())
      .filter(([_, config]) => config.required)
      .every(([name, _]) => {
        const health = this.healthStatus.get(name);
        return health && health.status === 'healthy';
      });

    let status: 'healthy' | 'degraded' | 'critical';
    if (!requiredServicesHealthy || unhealthy > 0) {
      status = 'critical';
    } else if (degraded > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      healthy,
      degraded,
      unhealthy,
      requiredServicesHealthy,
    };
  }

  /**
   * Update service health status
   */
  updateServiceHealth(
    name: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    responseTime?: number,
    details?: Record<string, any>
  ) {
    const current = this.healthStatus.get(name);
    if (!current) return;

    const isFailure = status === 'unhealthy';
    const consecutiveFailures = isFailure
      ? (current.consecutiveFailures || 0) + 1
      : 0;

    this.healthStatus.set(name, {
      ...current,
      status,
      lastCheck: new Date(),
      responseTime,
      errorCount: isFailure ? current.errorCount + 1 : current.errorCount,
      consecutiveFailures,
      details,
    });

    // Log significant status changes
    if (current.status !== status) {
      const level = status === 'unhealthy' ? 'error' : status === 'degraded' ? 'warn' : 'info';
      logger[level](`Service health changed: ${name}`, {
        previousStatus: current.status,
        newStatus: status,
        consecutiveFailures,
        responseTime,
      });
    }

    // Circuit breaker: Disable service after too many failures
    if (consecutiveFailures >= 5) {
      logger.error(`Service circuit breaker triggered: ${name}`, {
        consecutiveFailures,
        errorCount: current.errorCount,
      });
    }
  }

  /**
   * Start health check for a service
   */
  private startHealthCheck(name: string) {
    const config = this.services.get(name);
    if (!config || !config.healthCheckInterval) return;

    // Clear existing interval if any
    const existingInterval = this.healthCheckIntervals.get(name);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Perform immediate check
    this.performHealthCheck(name);

    // Schedule periodic checks
    const interval = setInterval(() => {
      this.performHealthCheck(name);
    }, config.healthCheckInterval);

    this.healthCheckIntervals.set(name, interval);
  }

  /**
   * Perform health check for a service
   */
  private async performHealthCheck(name: string) {
    const config = this.services.get(name);
    if (!config) return;

    const startTime = Date.now();

    try {
      if (config.healthCheckEndpoint) {
        const url = `${config.baseUrl}${config.healthCheckEndpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          this.updateServiceHealth(name, 'healthy', responseTime, {
            statusCode: response.status,
          });
        } else {
          const status = response.status >= 500 ? 'unhealthy' : 'degraded';
          this.updateServiceHealth(name, status, responseTime, {
            statusCode: response.status,
            statusText: response.statusText,
          });
        }
      } else {
        // For services without health endpoints, mark as healthy if configured
        this.updateServiceHealth(name, 'healthy', Date.now() - startTime);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceHealth(name, 'unhealthy', responseTime, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Stop all health checks
   */
  stopAllHealthChecks() {
    for (const [name, interval] of this.healthCheckIntervals.entries()) {
      clearInterval(interval);
      logger.info(`Stopped health check for service: ${name}`);
    }
    this.healthCheckIntervals.clear();
  }

  /**
   * Check if a service should be used based on health
   */
  shouldUseService(name: string): boolean {
    const health = this.healthStatus.get(name);
    const config = this.services.get(name);

    if (!health || !config) return false;

    // Always use required services
    if (config.required) return true;

    // Circuit breaker: Don't use service with too many failures
    if (health.consecutiveFailures >= 5) return false;

    // Use healthy and degraded services
    return health.status === 'healthy' || health.status === 'degraded';
  }

  /**
   * Get recommended timeout for a service
   */
  getServiceTimeout(name: string): number {
    const config = this.services.get(name);
    const health = this.healthStatus.get(name);

    if (!config) return 30000; // Default 30s

    // Increase timeout for degraded services
    if (health && health.status === 'degraded') {
      return config.timeout * 1.5;
    }

    return config.timeout;
  }
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();