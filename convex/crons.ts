/**
 * Convex scheduled jobs (cron)
 * Periodic maintenance and cleanup tasks
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Cleanup empty chats every hour
 * Removes chats older than 1 hour with no messages
 * Prevents database pollution from abandoned empty chats
 */
crons.hourly(
  "cleanup-empty-chats",
  { minuteUTC: 0 }, // Run at minute 0 of every hour
  internal.chats.cleanup.cleanupEmptyChats,
);

export default crons;
