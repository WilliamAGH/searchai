"use node";

import type { RunContext } from "@openai/agents";
import type { ActionCtx } from "../_generated/server";

/**
 * Context type for agent tool execution.
 * Provides access to Convex ActionCtx for database operations and action calls.
 */
export type AgentToolContext = { actionCtx?: ActionCtx } | undefined;

/**
 * RunContext wrapper for tool execute functions.
 * The SDK passes this to tool execute handlers.
 */
export type AgentToolRunContext = RunContext<AgentToolContext> | undefined;

export const getActionCtx = (ctx?: AgentToolRunContext): ActionCtx => {
  const actionCtx = ctx?.context?.actionCtx;
  if (!actionCtx) {
    throw new Error(
      "Convex ActionCtx missing from tool run context. Ensure run() is called with context: { actionCtx }.",
    );
  }
  return actionCtx;
};
