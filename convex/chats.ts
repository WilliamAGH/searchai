/**
 * Chat management functions
 * Re-exports modularized functions from dedicated files
 * - CRUD operations for chats/messages
 * - Share ID generation and lookup
 * - Auth-based access control
 * - Rolling summary for context compression
 */

// Re-export utility functions
export { buildContextSummary } from "./chats/utils";
export { generateOpaqueId } from "./lib/uuid";

// Re-export core chat operations
export {
  createChat,
  getUserChats,
  getChatById,
  getChatByIdHttp,
  getChatByIdDirect,
  getChat,
  getChatByOpaqueId,
  getChatByShareId,
  getChatByShareIdHttp,
  getChatByPublicId,
} from "./chats/core";

// Re-export message operations
export { getChatMessages, getChatMessagesHttp } from "./chats/messages";

// Re-export update operations
export {
  updateChatTitle,
  internalUpdateChatTitle,
  updateRollingSummary,
  updateChatPrivacy,
} from "./chats/updates";

// Re-export summarization operations
export { summarizeRecent, summarizeRecentAction } from "./chats/summarization";

// Re-export deletion operations
export { deleteChat } from "./chats/deletion";

// Re-export migration operations
export { importLocalChats, publishAnonymousChat } from "./chats/migration";
export { migrateMessagesToWebResearchSources } from "./chats/webResearchSourcesMigration";

// Re-export subscription operations
export {
  subscribeToChatUpdates,
  subscribeToMessageStream,
} from "./chats/subscriptions";

// Re-export cleanup operations
export { cleanupEmptyChats } from "./chats/cleanup";
