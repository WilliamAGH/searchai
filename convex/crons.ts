/**
 * Convex scheduled jobs (cron)
 * Periodic maintenance and cleanup tasks
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Cleanup empty chats every 10 minutes
 * Removes chats older than 1 hour with no messages
 * Prevents database pollution from abandoned empty chats
 *
 * OPTIMIZATION: Runs frequently with small batches (500 chats/run)
 * instead of processing all chats at once, preventing read limit issues
 */
crons.interval(
  "cleanup-empty-chats",
  { minutes: 10 }, // Run every 10 minutes in small batches
  internal.chats.cleanup.cleanupEmptyChats,
);

export default crons;
