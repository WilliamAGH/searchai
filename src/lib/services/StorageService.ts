/**
 * Centralized Storage Service
 *
 * Provides a unified interface for all localStorage operations
 * with error handling, type safety, and migration support.
 *
 * Benefits:
 * - Single source of truth for storage keys
 * - Consistent error handling
 * - Easy to mock for testing
 * - Migration support for schema changes
 * - Prevents key collisions
 */

import { logger } from "../logger";

/**
 * All storage keys used in the application
 * Centralized to prevent key collisions and make refactoring easier
 */
export const STORAGE_KEYS = {
  // Chat storage
  CHATS: "searchai:chats",
  MESSAGES: "searchai:messages",
  CURRENT_CHAT_ID: "searchai:currentChatId",

  // Migration tracking
  MIGRATION_VERSION: "searchai:migrationVersion",
  MIGRATION_COMPLETED: "searchai:migrationCompleted",
  MIGRATION_MAPPING: "searchai:migrationMapping",

  // UI preferences
  THEME: "searchai:theme",
  SIDEBAR_OPEN: "searchai:sidebarOpen",

  // Session data
  OPEN_SHARE_MODAL: "searchai:openShareModal",
  DRAFT_MESSAGE: "searchai:draftMessage",

  // Legacy keys (for migration)
  LEGACY_CHATS: "chats",
  LEGACY_MESSAGES: "messages",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Storage service class for centralized localStorage operations
 */
class StorageService {
  private readonly prefix = "searchai:";

  /**
   * Get an item from localStorage with type safety
   */
  get<T>(key: StorageKey, defaultValue?: T): T | null {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue ?? null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      logger.error(`Failed to get localStorage key "${key}":`, error);
      return defaultValue ?? null;
    }
  }

  /**
   * Set an item in localStorage
   */
  set<T>(key: StorageKey, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Failed to set localStorage key "${key}":`, error);
      return false;
    }
  }

  /**
   * Remove an item from localStorage
   */
  remove(key: StorageKey): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logger.error(`Failed to remove localStorage key "${key}":`, error);
      return false;
    }
  }

  /**
   * Clear all items with the searchai: prefix
   */
  clearAll(): boolean {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      }
      return true;
    } catch (error) {
      logger.error("Failed to clear localStorage:", error);
      return false;
    }
  }

  /**
   * Check if a key exists in localStorage
   */
  has(key: StorageKey): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch (error) {
      logger.error(`Failed to check localStorage key "${key}":`, error);
      return false;
    }
  }

  /**
   * Get all keys that match a pattern
   */
  getKeys(pattern?: RegExp): string[] {
    try {
      const keys = Object.keys(localStorage);
      if (!pattern) {
        return keys.filter((key) => key.startsWith(this.prefix));
      }
      return keys.filter((key) => pattern.test(key));
    } catch (error) {
      logger.error("Failed to get localStorage keys:", error);
      return [];
    }
  }

  /**
   * Get the size of stored data for a key (in bytes)
   */
  getSize(key: StorageKey): number {
    try {
      const item = localStorage.getItem(key);
      if (!item) return 0;
      // Rough estimate: 2 bytes per character
      return item.length * 2;
    } catch (error) {
      logger.error(`Failed to get size for key "${key}":`, error);
      return 0;
    }
  }

  /**
   * Get total size of all stored data (in bytes)
   */
  getTotalSize(): number {
    try {
      let total = 0;
      const keys = this.getKeys();
      for (const key of keys) {
        total += this.getSize(key as StorageKey);
      }
      return total;
    } catch (error) {
      logger.error("Failed to calculate total storage size:", error);
      return 0;
    }
  }

  /**
   * Migrate data from old keys to new keys
   */
  migrate(oldKey: string, newKey: StorageKey): boolean {
    try {
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        localStorage.setItem(newKey, oldData);
        localStorage.removeItem(oldKey);
        logger.info(`Migrated data from "${oldKey}" to "${newKey}"`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to migrate from "${oldKey}" to "${newKey}":`, error);
      return false;
    }
  }

  /**
   * Batch operations for better performance
   */
  batch<T>(
    operations: Array<{ type: "set" | "remove"; key: StorageKey; value?: T }>,
  ): boolean {
    try {
      for (const op of operations) {
        if (op.type === "set" && op.value !== undefined) {
          this.set(op.key, op.value);
        } else if (op.type === "remove") {
          this.remove(op.key);
        }
      }
      return true;
    } catch (error) {
      logger.error("Batch operation failed:", error);
      return false;
    }
  }

  /**
   * Check if localStorage is available
   */
  isAvailable(): boolean {
    try {
      const testKey = "__searchai_test__";
      localStorage.setItem(testKey, "test");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage quota information
   */
  async getQuota(): Promise<{ usage: number; quota: number } | null> {
    try {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        };
      }
      return null;
    } catch (error) {
      logger.error("Failed to get storage quota:", error);
      return null;
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();

// Export types for use in other modules
export type { StorageService };
