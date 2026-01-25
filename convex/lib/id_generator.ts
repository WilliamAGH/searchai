/**
 * UUID v7 ID Generation Utilities
 *
 * Generates time-ordered UUIDs (RFC 9562) for:
 * - Message IDs: Unique identifier for each message in a conversation
 * - Thread IDs: Unique identifier for conversation threads
 *
 * Benefits:
 * - Chronologically sortable (timestamp embedded in UUID)
 * - Better database performance (sequential IDs)
 * - Globally unique across distributed systems
 * - Compatible with standard UUID tooling
 *
 * @see https://datatracker.ietf.org/doc/rfc9562/
 */

import { uuidv7 } from "uuidv7";

/**
 * Generate a message ID (UUID v7)
 *
 * Used for individual messages within a conversation thread.
 * Each message gets a unique, time-ordered ID.
 *
 * @returns Time-ordered UUID for message tracking
 */
export function generateMessageId(): string {
  return uuidv7();
}

/**
 * Generate a thread ID (UUID v7)
 *
 * Used for conversation threads/sessions.
 * All messages in a thread share the same thread ID.
 *
 * @returns Time-ordered UUID for thread tracking
 */
export function generateThreadId(): string {
  return uuidv7();
}

/**
 * Generate a conversation ID (alias for generateThreadId)
 *
 * @returns Time-ordered UUID for conversation tracking
 */
export function generateConversationId(): string {
  return uuidv7();
}
