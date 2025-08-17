/**
 * Atomic Storage Service
 * Thread-safe localStorage wrapper with atomic operations
 * Prevents data corruption from concurrent access
 *
 * CRITICAL iOS SAFARI MEMORY MANAGEMENT:
 *
 * This service includes automatic cleanup to prevent memory issues on iOS Safari:
 * - Hourly cleanup of expired items via managed interval
 * - Proper interval cleanup on destroy() to prevent memory leaks
 * - Cache eviction for items older than 7 days
 * - Quota exceeded handling with automatic cleanup retry
 *
 * MEMORY LEAK PREVENTION:
 * - The cleanup interval MUST be properly cleared in destroy()
 * - Always call destroy() when the app unmounts (if using singleton)
 * - Intervals not cleared will continue running and consume memory
 * - iOS Safari is particularly sensitive to memory pressure
 *
 * @see https://bugs.webkit.org/show_bug.cgi?id=195325 - iOS Safari memory limits
 */

import { logger } from "../logger";

interface StorageOptions {
  prefix?: string;
  ttl?: number;
  encrypt?: boolean;
  compress?: boolean;
}

interface StorageItem<T> {
  value: T;
  timestamp: number;
  ttl?: number;
  version: number;
}

/**
 * Atomic Storage Implementation
 *
 * Singleton pattern with managed lifecycle for memory efficiency.
 * IMPORTANT: The cleanupInterval property tracks the hourly cleanup timer
 * and MUST be cleared when the instance is destroyed.
 */
export class AtomicStorage {
  private static instance: AtomicStorage;
  private readonly prefix: string;
  private readonly locks: Map<string, Promise<void>> = new Map();
  private readonly cache: Map<string, unknown> = new Map();
  private readonly version = 1;
  /** Cleanup interval handle - MUST be cleared on destroy to prevent memory leaks */
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor(options: StorageOptions = {}) {
    this.prefix = options.prefix || "atomic_";
    this.initializeCleanup();
  }

  static getInstance(options?: StorageOptions): AtomicStorage {
    if (!AtomicStorage.instance) {
      AtomicStorage.instance = new AtomicStorage(options);
    }
    return AtomicStorage.instance;
  }

  /**
   * Get item from storage
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);

    // Check cache first
    if (this.cache.has(fullKey)) {
      return this.cache.get(fullKey) as T;
    }

    return this.withLock(fullKey, () => {
      try {
        const raw = localStorage.getItem(fullKey);
        if (!raw) return null;

        const item: StorageItem<T> = JSON.parse(raw);

        // Check TTL
        if (item.ttl) {
          const expired = Date.now() - item.timestamp > item.ttl;
          if (expired) {
            localStorage.removeItem(fullKey);
            this.cache.delete(fullKey);
            return null;
          }
        }

        // Update cache
        this.cache.set(fullKey, item.value);
        return item.value;
      } catch (error) {
        logger.error(`Failed to get item from storage: ${key}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    });
  }

  /**
   * Set item in storage
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    return this.withLock(fullKey, () => {
      try {
        const item: StorageItem<T> = {
          value,
          timestamp: Date.now(),
          ttl,
          version: this.version,
        };

        const serialized = JSON.stringify(item);

        // Check storage quota
        if (this.isQuotaExceeded(serialized)) {
          this.cleanup();

          // Try again after cleanup
          if (this.isQuotaExceeded(serialized)) {
            logger.error("Storage quota exceeded even after cleanup");
            return false;
          }
        }

        localStorage.setItem(fullKey, serialized);
        this.cache.set(fullKey, value);

        return true;
      } catch (error) {
        logger.error(`Failed to set item in storage: ${key}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return false;
      }
    });
  }

  /**
   * Remove item from storage
   */
  async remove(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    return this.withLock(fullKey, () => {
      try {
        localStorage.removeItem(fullKey);
        this.cache.delete(fullKey);
        return true;
      } catch (error) {
        logger.error(`Failed to remove item from storage: ${key}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return false;
      }
    });
  }

  /**
   * Update item atomically
   */
  async update<T>(
    key: string,
    updater: (current: T | null) => T,
    ttl?: number,
  ): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    return this.withLock(fullKey, async () => {
      try {
        const current = await this.get<T>(key);
        const updated = updater(current);
        return await this.set(key, updated, ttl);
      } catch (error) {
        logger.error(`Failed to update item in storage: ${key}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return false;
      }
    });
  }

  /**
   * Clear all items with prefix
   */
  async clear(): Promise<void> {
    const keys = this.getAllKeys();

    for (const key of keys) {
      await this.remove(key.replace(this.prefix, ""));
    }

    this.cache.clear();
    logger.info(`Cleared ${keys.length} items from storage`);
  }

  /**
   * Get all keys with prefix
   */
  getAllKeys(): string[] {
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Get storage size in bytes
   */
  getSize(): number {
    let size = 0;

    for (const key of this.getAllKeys()) {
      const value = localStorage.getItem(key);
      if (value) {
        size += key.length + value.length;
      }
    }

    return size;
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    itemCount: number;
    sizeBytes: number;
    sizeMB: number;
    cacheSize: number;
    oldestItem?: Date;
    newestItem?: Date;
  } {
    const keys = this.getAllKeys();
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;
    let totalSize = 0;

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          totalSize += key.length + raw.length;

          const item = JSON.parse(raw);
          if (item.timestamp) {
            if (!oldestTimestamp || item.timestamp < oldestTimestamp) {
              oldestTimestamp = item.timestamp;
            }
            if (!newestTimestamp || item.timestamp > newestTimestamp) {
              newestTimestamp = item.timestamp;
            }
          }
        }
      } catch {
        // Ignore invalid items
      }
    }

    return {
      itemCount: keys.length,
      sizeBytes: totalSize,
      sizeMB: totalSize / (1024 * 1024),
      cacheSize: this.cache.size,
      oldestItem: oldestTimestamp ? new Date(oldestTimestamp) : undefined,
      newestItem: newestTimestamp ? new Date(newestTimestamp) : undefined,
    };
  }

  /**
   * Execute operation with lock
   */
  private async withLock<T>(
    key: string,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    // Wait for any existing lock
    const existingLock = this.locks.get(key);
    if (existingLock) {
      await existingLock;
    }

    // Create new lock
    let releaseLock: (() => void) | null = null;
    const lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, lock);

    try {
      const result = await operation();
      return result;
    } finally {
      this.locks.delete(key);
      if (releaseLock) {
        releaseLock();
      }
    }
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Check if storage quota is exceeded
   */
  private isQuotaExceeded(data: string): boolean {
    try {
      // Try to store a test item
      const testKey = `${this.prefix}_quota_test`;
      localStorage.setItem(testKey, data);
      localStorage.removeItem(testKey);
      return false;
    } catch (error) {
      if (error instanceof Error) {
        // Check for quota exceeded errors
        if (
          error.name === "QuotaExceededError" ||
          error.message.includes("quota") ||
          error.message.includes("storage")
        ) {
          return true;
        }
      }
      return false;
    }
  }

  /**
   * Cleanup expired items
   */
  private cleanup(): void {
    const keys = this.getAllKeys();
    let removed = 0;

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const item = JSON.parse(raw);

          // Remove expired items
          if (item.ttl) {
            const expired = Date.now() - item.timestamp > item.ttl;
            if (expired) {
              localStorage.removeItem(key);
              this.cache.delete(key);
              removed++;
            }
          }

          // Remove old items (>7 days)
          const age = Date.now() - item.timestamp;
          if (age > 7 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(key);
            this.cache.delete(key);
            removed++;
          }
        }
      } catch {
        // Remove invalid items
        localStorage.removeItem(key);
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`Cleaned up ${removed} expired/invalid items from storage`);
    }
  }

  /**
   * Initialize periodic cleanup
   *
   * CRITICAL: This creates an interval that MUST be cleared to prevent memory leaks.
   * iOS Safari is particularly sensitive to uncleaned intervals which can:
   * - Accumulate over time causing memory pressure
   * - Trigger aggressive garbage collection
   * - Lead to app performance degradation
   * - Cause input lag and focus issues
   */
  private initializeCleanup(): void {
    // Clear any existing interval to prevent multiple timers
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Run cleanup every hour - this interval MUST be cleared on destroy
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      60 * 60 * 1000,
    );

    // Initial cleanup
    this.cleanup();
  }

  /**
   * Destroy the storage instance and cleanup resources
   *
   * CRITICAL: Must be called when the app unmounts or during cleanup.
   * Failing to call this method will result in memory leaks from:
   * - Uncleaned interval continuing to run
   * - Cache entries not being cleared
   * - Lock promises remaining in memory
   *
   * This is especially important for iOS Safari which has strict memory limits.
   */
  public destroy(): void {
    // CRITICAL: Clear the interval to prevent memory leaks
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear all cached data
    this.cache.clear();
    // Clear all pending locks
    this.locks.clear();
  }
}

// Export singleton instance
export const atomicStorage = AtomicStorage.getInstance();

/**
 * React hook for atomic storage
 */
export function useAtomicStorage<T>(
  key: string,
  initialValue?: T,
): [T | null, (value: T) => Promise<void>, () => Promise<void>] {
  const [value, setValue] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Load initial value
    atomicStorage
      .get<T>(key)
      .then((stored) => {
        setValue(stored ?? initialValue ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [key, initialValue]);

  const updateValue = React.useCallback(
    async (newValue: T) => {
      await atomicStorage.set(key, newValue);
      setValue(newValue);
    },
    [key],
  );

  const removeValue = React.useCallback(async () => {
    await atomicStorage.remove(key);
    setValue(null);
  }, [key]);

  return [loading ? (initialValue ?? null) : value, updateValue, removeValue];
}

// Import React for the hook
import React from "react";
