/**
 * Chat Migration Hook
 * Handles migration from local storage to Convex when user authenticates
 */

import { useEffect, useRef } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import { MigrationService } from "../lib/services/MigrationService";
import { LocalChatRepository } from "../lib/repositories/LocalChatRepository";
import { logger } from "../lib/logger";

export function useChatMigration(
  repository: IChatRepository | null,
  isAuthenticated: boolean,
  state: ChatState,
  refreshChats: () => Promise<void>,
) {
  const hasMigratedRef = useRef(false);

  useEffect(() => {
    if (!repository || !isAuthenticated || hasMigratedRef.current) return;

    // Only migrate if we're using Convex repository
    if (repository.storageType !== "convex") return;

    const migrate = async () => {
      try {
        // Create LocalChatRepository for migration source
        const localRepo = new LocalChatRepository();

        // Create MigrationService with both repositories
        const migrationService = new MigrationService(localRepo, repository);

        // Check if migration is needed
        const needsMigration = await migrationService.isMigrationNeeded();

        if (needsMigration) {
          logger.info("Starting migration to Convex");
          const result = await migrationService.migrateUserData();

          if (result.success) {
            logger.info(
              `Migration completed: ${result.migratedChats} chats migrated`,
            );
            hasMigratedRef.current = true;

            // Refresh chats after migration
            await refreshChats();
          } else if (result.error) {
            logger.error("Migration failed:", result.error);
          }
        } else {
          // No migration needed, mark as complete
          hasMigratedRef.current = true;
        }
      } catch (error) {
        logger.error("Migration error:", error);
      }
    };

    migrate();
  }, [repository, isAuthenticated, refreshChats]);

  return hasMigratedRef.current;
}
