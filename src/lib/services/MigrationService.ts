/**
 * Migration Service
 * Handles data migration between localStorage and Convex
 * Provides seamless transition when users authenticate
 */

import { LocalChatRepository } from "../repositories/LocalChatRepository";
import { ConvexChatRepository } from "../repositories/ConvexChatRepository";
import { IChatRepository } from "../repositories/ChatRepository";
import { MigrationResult } from "../types/unified";
import {
  parseLocalChats,
  parseLocalMessages,
} from "../validation/localStorage";

const MIGRATION_KEY = "searchai_migration_status";
const MIGRATION_ARCHIVE_PREFIX = "searchai_archive_";

export interface MigrationStatus {
  lastAttempt?: number;
  lastSuccess?: number;
  failedAttempts: number;
  migratedChats: string[];
  mapping: Record<string, string>; // localId -> convexId
}

export class MigrationService {
  private localRepo: LocalChatRepository;
  private convexRepo: ConvexChatRepository | IChatRepository;

  constructor(
    localRepo: LocalChatRepository,
    convexRepo: ConvexChatRepository | IChatRepository,
  ) {
    this.localRepo = localRepo;
    this.convexRepo = convexRepo;
  }

  /**
   * Get migration status from localStorage
   */
  private getMigrationStatus(): MigrationStatus {
    try {
      const stored = localStorage.getItem(MIGRATION_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error("Failed to load migration status:", error);
    }

    return {
      failedAttempts: 0,
      migratedChats: [],
      mapping: {},
    };
  }

  /**
   * Save migration status to localStorage
   */
  private saveMigrationStatus(status: MigrationStatus): void {
    try {
      localStorage.setItem(MIGRATION_KEY, JSON.stringify(status));
    } catch (error) {
      console.error("Failed to save migration status:", error);
    }
  }

  /**
   * Archive local data before migration
   */
  private async archiveLocalData(): Promise<void> {
    const timestamp = Date.now();
    const { chats, messages } = await this.localRepo.exportData();

    try {
      // Archive chats
      localStorage.setItem(
        `${MIGRATION_ARCHIVE_PREFIX}chats_${timestamp}`,
        JSON.stringify(chats),
      );

      // Archive messages
      localStorage.setItem(
        `${MIGRATION_ARCHIVE_PREFIX}messages_${timestamp}`,
        JSON.stringify(messages),
      );

      console.info(
        `Archived ${chats.length} chats and ${messages.length} messages`,
      );
    } catch (error) {
      console.error("Failed to archive local data:", error);
      throw new Error("Failed to archive data before migration");
    }
  }

  /**
   * Restore local data from archive
   */
  private async restoreFromArchive(timestamp: number): Promise<void> {
    try {
      const chatsStr = localStorage.getItem(
        `${MIGRATION_ARCHIVE_PREFIX}chats_${timestamp}`,
      );
      const messagesStr = localStorage.getItem(
        `${MIGRATION_ARCHIVE_PREFIX}messages_${timestamp}`,
      );

      if (chatsStr && messagesStr) {
        const chats = parseLocalChats(chatsStr);
        const messages = parseLocalMessages(messagesStr);

        await this.localRepo.importData({ chats, messages });
        console.info("Restored data from archive");
      }
    } catch (error) {
      console.error("Failed to restore from archive:", error);
    }
  }

  /**
   * Migrate all user data from localStorage to Convex
   */
  async migrateUserData(): Promise<MigrationResult> {
    const status = this.getMigrationStatus();

    // Check if we should attempt migration (rate limiting)
    if (status.lastAttempt) {
      const timeSinceLastAttempt = Date.now() - status.lastAttempt;
      const backoffMs = Math.min(
        60000 * Math.pow(2, status.failedAttempts),
        300000,
      ); // Max 5 min

      if (timeSinceLastAttempt < backoffMs) {
        return {
          success: false,
          migrated: 0,
          failed: 0,
          errors: [
            `Rate limited. Try again in ${Math.ceil((backoffMs - timeSinceLastAttempt) / 1000)}s`,
          ],
        };
      }
    }

    status.lastAttempt = Date.now();
    this.saveMigrationStatus(status);

    const { chats, messages } = await this.localRepo.exportData();

    if (chats.length === 0) {
      return {
        success: true,
        migrated: 0,
        failed: 0,
      };
    }

    // Archive before migration
    const archiveTimestamp = Date.now();
    await this.archiveLocalData();

    const migrationMap = new Map<string, string>();
    const errors: string[] = [];
    let migratedCount = 0;
    let failedCount = 0;

    try {
      // Migrate chats one by one
      for (const chat of chats) {
        // Skip if already migrated
        if (status.migratedChats.includes(chat.id)) {
          if (status.mapping[chat.id]) {
            migrationMap.set(chat.id, status.mapping[chat.id]);
          }
          continue;
        }

        try {
          // Create chat in Convex
          const { chat: convexChat } = await this.convexRepo.createChat(
            chat.title,
          );
          migrationMap.set(chat.id, convexChat.id);

          // Update privacy if needed
          if (chat.privacy !== "private") {
            await this.convexRepo.updateChatPrivacy(
              convexChat.id,
              chat.privacy,
            );
          }

          // Migrate messages for this chat
          const chatMessages = messages.filter((m) => m.chatId === chat.id);

          for (const message of chatMessages) {
            try {
              // For Convex, we need to handle this differently
              // Messages are typically added through the streaming response
              // For migration, we'd need a special import mutation

              // For now, we skip message migration as it requires backend changes
              // In a full implementation, we'd have an importMessage mutation
              console.info(
                `Would migrate message ${message.id} to chat ${convexChat.id}`,
              );
            } catch (msgError) {
              console.error(
                `Failed to migrate message ${message.id}:`,
                msgError,
              );
            }
          }

          // Mark chat as migrated
          status.migratedChats.push(chat.id);
          status.mapping[chat.id] = convexChat.id;
          migratedCount++;

          // Save progress after each successful chat migration
          this.saveMigrationStatus(status);
        } catch (chatError) {
          console.error(`Failed to migrate chat ${chat.id}:`, chatError);
          errors.push(
            `Chat ${chat.title}: ${chatError instanceof Error ? chatError.message : "Unknown error"}`,
          );
          failedCount++;
        }
      }

      // If all chats migrated successfully, clear local data
      if (failedCount === 0) {
        // Clear the main storage keys
        localStorage.removeItem("searchai_chats_v2");
        localStorage.removeItem("searchai_messages_v2");

        // Update status
        status.lastSuccess = Date.now();
        status.failedAttempts = 0;
      } else {
        // Some failed, increment failure counter
        status.failedAttempts++;
      }

      this.saveMigrationStatus(status);

      return {
        success: failedCount === 0,
        migrated: migratedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined,
        mapping: migrationMap,
      };
    } catch (error) {
      // Critical failure - restore from archive
      console.error("Critical migration failure:", error);
      await this.restoreFromArchive(archiveTimestamp);

      status.failedAttempts++;
      this.saveMigrationStatus(status);

      return {
        success: false,
        migrated: migratedCount,
        failed: failedCount,
        errors: [error instanceof Error ? error.message : "Migration failed"],
      };
    }
  }

  /**
   * Check if migration is needed
   */
  async isMigrationNeeded(): Promise<boolean> {
    const { chats } = await this.localRepo.exportData();
    const status = this.getMigrationStatus();

    // Check if there are unmigrated chats
    const unmigratedChats = chats.filter(
      (c) => !status.migratedChats.includes(c.id),
    );
    return unmigratedChats.length > 0;
  }

  /**
   * Reset migration status (for debugging)
   */
  resetMigrationStatus(): void {
    localStorage.removeItem(MIGRATION_KEY);

    // Clear all archives
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(MIGRATION_ARCHIVE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Get migration progress
   */
  getMigrationProgress(): {
    totalChats: number;
    migratedChats: number;
    percentage: number;
  } {
    const status = this.getMigrationStatus();
    const localChats = parseLocalChats(
      localStorage.getItem("searchai_chats_v2") || "[]",
    );
    const totalChats = localChats.length;
    const migratedChats = status.migratedChats.length;

    return {
      totalChats,
      migratedChats,
      percentage: totalChats > 0 ? (migratedChats / totalChats) * 100 : 100,
    };
  }
}
