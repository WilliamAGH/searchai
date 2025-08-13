/**
 * Chat Migration Hook
 * Handles migration from local storage to Convex when user authenticates
 */

import { useEffect, useRef } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import { MigrationService } from "../lib/services/MigrationService";
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

    const migrate = async () => {
      try {
        const migrationService = new MigrationService();
        const hasPendingMigration =
          await migrationService.hasPendingMigration();

        if (hasPendingMigration && repository.storageType === "convex") {
          logger.info("Starting migration to Convex");
          const result = await migrationService.migrateToConvex(repository);

          if (result.success) {
            logger.info(`Migration completed: ${result.migratedChats} chats`);
            hasMigratedRef.current = true;

            // Refresh chats after migration
            await refreshChats();
          } else if (result.error) {
            logger.error("Migration failed:", result.error);
          }
        }
      } catch (error) {
        logger.error("Migration error:", error);
      }
    };

    migrate();
  }, [repository, isAuthenticated, refreshChats]);

  return hasMigratedRef.current;
}
