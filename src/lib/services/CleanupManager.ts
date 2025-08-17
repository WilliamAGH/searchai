/**
 * Cleanup Manager
 * Manages resource cleanup and memory management
 * Prevents memory leaks by tracking and cleaning up resources
 *
 * @note Works in both Node.js and browser environments. Uses ReturnType<typeof setInterval>
 * for timer typing to ensure compatibility across environments, as NodeJS.Timeout
 * type is not available in browsers.
 */

import { logger } from "../logger";
import React from "react";

type CleanupFunction = () => void | Promise<void>;
type ResourceType =
  | "subscription"
  | "timer"
  | "eventListener"
  | "stream"
  | "worker"
  | "other";

interface TrackedResource {
  id: string;
  type: ResourceType;
  cleanup: CleanupFunction;
  createdAt: Date;
  component?: string;
  description?: string;
}

/**
 * Cleanup Manager
 * Centralized resource tracking and cleanup
 */
export class CleanupManager {
  private static instance: CleanupManager;
  private resources: Map<string, TrackedResource> = new Map();
  private resourceCounters: Map<ResourceType, number> = new Map();
  private cleanupQueue: Set<string> = new Set();
  private isCleaningUp: boolean = false;
  private memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.initializeMemoryMonitoring();
  }

  static getInstance(): CleanupManager {
    if (!CleanupManager.instance) {
      CleanupManager.instance = new CleanupManager();
    }
    return CleanupManager.instance;
  }

  /**
   * Register a resource for tracking and cleanup
   */
  register(
    type: ResourceType,
    cleanup: CleanupFunction,
    options?: {
      component?: string;
      description?: string;
    },
  ): string {
    const id = this.generateResourceId(type);

    const resource: TrackedResource = {
      id,
      type,
      cleanup,
      createdAt: new Date(),
      component: options?.component,
      description: options?.description,
    };

    this.resources.set(id, resource);

    // Update counters
    const currentCount = this.resourceCounters.get(type) || 0;
    this.resourceCounters.set(type, currentCount + 1);

    logger.debug(`Resource registered: ${id}`, {
      type,
      component: options?.component,
      description: options?.description,
      totalResources: this.resources.size,
    });

    // Warn if too many resources
    if (this.resources.size > 100) {
      logger.warn("High number of tracked resources", {
        count: this.resources.size,
        byType: Object.fromEntries(this.resourceCounters),
      });
    }

    return id;
  }

  /**
   * Unregister and cleanup a specific resource
   */
  async unregister(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (!resource) {
      logger.debug(`Resource not found for cleanup: ${id}`);
      return;
    }

    try {
      await resource.cleanup();
      this.resources.delete(id);

      // Update counters
      const currentCount = this.resourceCounters.get(resource.type) || 0;
      if (currentCount > 0) {
        this.resourceCounters.set(resource.type, currentCount - 1);
      }

      logger.debug(`Resource cleaned up: ${id}`, {
        type: resource.type,
        component: resource.component,
        age: Date.now() - resource.createdAt.getTime(),
      });
    } catch (error) {
      logger.error(`Failed to cleanup resource: ${id}`, {
        error: error instanceof Error ? error.message : "Unknown error",
        type: resource.type,
        component: resource.component,
      });
    }
  }

  /**
   * Cleanup all resources for a specific component
   */
  async cleanupComponent(component: string): Promise<void> {
    const componentResources = Array.from(this.resources.values()).filter(
      (r) => r.component === component,
    );

    if (componentResources.length === 0) {
      logger.debug(`No resources to cleanup for component: ${component}`);
      return;
    }

    logger.info(
      `Cleaning up ${componentResources.length} resources for component: ${component}`,
    );

    const cleanupPromises = componentResources.map((resource) =>
      this.unregister(resource.id),
    );

    await Promise.all(cleanupPromises);
  }

  /**
   * Cleanup all resources of a specific type
   */
  async cleanupByType(type: ResourceType): Promise<void> {
    const typeResources = Array.from(this.resources.values()).filter(
      (r) => r.type === type,
    );

    if (typeResources.length === 0) {
      logger.debug(`No resources to cleanup for type: ${type}`);
      return;
    }

    logger.info(
      `Cleaning up ${typeResources.length} resources of type: ${type}`,
    );

    const cleanupPromises = typeResources.map((resource) =>
      this.unregister(resource.id),
    );

    await Promise.all(cleanupPromises);
  }

  /**
   * Cleanup all tracked resources
   * @note Uses try/finally to ensure isCleaningUp flag is always reset,
   * preventing the cleanup from getting stuck if an error occurs
   */
  async cleanupAll(): Promise<void> {
    if (this.isCleaningUp) {
      logger.warn("Cleanup already in progress");
      return;
    }

    this.isCleaningUp = true;
    try {
      const totalResources = this.resources.size;

      if (totalResources === 0) {
        logger.info("No resources to cleanup");
        return;
      }

      logger.info(`Starting cleanup of ${totalResources} resources`);

      // Create array of all resources
      const allResources = Array.from(this.resources.values());

      // Group by type for organized cleanup
      const byType = new Map<ResourceType, TrackedResource[]>();
      for (const resource of allResources) {
        const typeResources = byType.get(resource.type) || [];
        typeResources.push(resource);
        byType.set(resource.type, typeResources);
      }

      // Cleanup in order of priority
      const cleanupOrder: ResourceType[] = [
        "stream",
        "worker",
        "subscription",
        "eventListener",
        "timer",
        "other",
      ];

      for (const type of cleanupOrder) {
        const resources = byType.get(type) || [];
        if (resources.length > 0) {
          logger.info(`Cleaning up ${resources.length} ${type} resources`);
          await Promise.all(resources.map((r) => this.unregister(r.id)));
        }
      }

      logger.info(`Cleanup completed. Cleaned up ${totalResources} resources`);
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Get resource statistics
   */
  getStats(): {
    total: number;
    byType: Record<ResourceType, number>;
    oldestResource: Date | null;
    averageAge: number;
  } {
    const resources = Array.from(this.resources.values());
    const now = Date.now();

    let oldestDate: Date | null = null;
    let totalAge = 0;

    for (const resource of resources) {
      if (!oldestDate || resource.createdAt < oldestDate) {
        oldestDate = resource.createdAt;
      }
      totalAge += now - resource.createdAt.getTime();
    }

    return {
      total: this.resources.size,
      byType: Object.fromEntries(this.resourceCounters),
      oldestResource: oldestDate,
      averageAge: resources.length > 0 ? totalAge / resources.length : 0,
    };
  }

  /**
   * Schedule resource for cleanup
   */
  scheduleCleanup(id: string, delayMs: number): void {
    setTimeout(() => {
      this.unregister(id);
    }, delayMs);
  }

  /**
   * Create a cleanup scope
   */
  createScope(): CleanupScope {
    return new CleanupScope(this);
  }

  /**
   * Initialize memory monitoring
   */
  private initializeMemoryMonitoring(): void {
    // Monitor memory usage every 30 seconds
    this.memoryMonitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);
  }

  /**
   * Check memory usage and trigger cleanup if needed
   */
  private checkMemoryUsage(): void {
    if (typeof performance === "undefined" || !("memory" in performance)) {
      return;
    }

    const memory = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    if (!memory) return;
    const usedJSHeapSize = memory.usedJSHeapSize;
    const jsHeapSizeLimit = memory.jsHeapSizeLimit;
    const usage = (usedJSHeapSize / jsHeapSizeLimit) * 100;

    logger.debug("Memory usage", {
      used: Math.round(usedJSHeapSize / 1024 / 1024) + " MB",
      limit: Math.round(jsHeapSizeLimit / 1024 / 1024) + " MB",
      percentage: usage.toFixed(2) + "%",
    });

    // Trigger cleanup if memory usage is high
    if (usage > 80) {
      logger.warn("High memory usage detected", {
        percentage: usage.toFixed(2) + "%",
        resources: this.resources.size,
      });

      // Cleanup old resources
      this.cleanupOldResources();
    }
  }

  /**
   * Cleanup resources older than threshold
   */
  private cleanupOldResources(maxAgeMs: number = 5 * 60 * 1000): void {
    const now = Date.now();
    const oldResources = Array.from(this.resources.values()).filter(
      (r) => now - r.createdAt.getTime() > maxAgeMs,
    );

    if (oldResources.length > 0) {
      logger.info(`Cleaning up ${oldResources.length} old resources`);
      oldResources.forEach((r) => this.unregister(r.id));
    }
  }

  /**
   * Generate unique resource ID
   */
  private generateResourceId(type: ResourceType): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
  }
}

/**
 * Cleanup Scope
 * Manages resources within a specific scope
 */
export class CleanupScope {
  private manager: CleanupManager;
  private scopeResources: Set<string> = new Set();

  constructor(manager: CleanupManager) {
    this.manager = manager;
  }

  /**
   * Register a resource in this scope
   */
  register(
    type: ResourceType,
    cleanup: CleanupFunction,
    options?: {
      component?: string;
      description?: string;
    },
  ): string {
    const id = this.manager.register(type, cleanup, options);
    this.scopeResources.add(id);
    return id;
  }

  /**
   * Cleanup all resources in this scope
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.scopeResources).map((id) =>
      this.manager.unregister(id),
    );
    await Promise.all(promises);
    this.scopeResources.clear();
  }
}

// Export singleton instance
export const cleanupManager = CleanupManager.getInstance();

/**
 * React hook for automatic cleanup
 * @note Properly handles async cleanup by catching errors to prevent
 * unhandled rejections during component unmount
 */
export function useCleanup(component: string) {
  const scope = React.useRef<CleanupScope | null>(null);

  React.useEffect(() => {
    scope.current = cleanupManager.createScope();

    return () => {
      if (scope.current) {
        void scope.current.cleanup().catch((err) => {
          logger.error("Cleanup scope failed during unmount", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    };
  }, []);

  return {
    register: (
      type: ResourceType,
      cleanup: CleanupFunction,
      description?: string,
    ) => {
      if (scope.current) {
        return scope.current.register(type, cleanup, {
          component,
          description,
        });
      }
      return "";
    },
  };
}
