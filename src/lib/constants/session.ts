/**
 * Session storage keys for anonymous users
 * Centralized to prevent string duplication across hooks/components
 */

/**
 * Current anonymous session identifier (uuidv7)
 */
export const ANON_SESSION_KEY = "searchai:anonymousSessionId" as const;

/**
 * Historical list of all anonymous session IDs used on this browser
 */
export const ALL_SESSIONS_KEY = "searchai:allSessionIds" as const;
