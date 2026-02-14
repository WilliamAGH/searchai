"use node";

/**
 * Agent-based AI generation route handlers
 * Uses multi-stage agentic workflow: Planning → Research → Synthesis
 */

import { httpAction } from "../../_generated/server";
import type { HttpRouter } from "convex/server";
import { corsPreflightResponse } from "../cors";
import { handleAgentStream } from "./aiAgent_stream";

/**
 * Register agent-based AI routes on the HTTP router
 */
export function registerAgentAIRoutes(http: HttpRouter) {
  http.route({
    path: "/api/ai/agent/stream",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      return corsPreflightResponse(request);
    }),
  });

  http.route({
    path: "/api/ai/agent/stream",
    method: "POST",
    handler: httpAction(handleAgentStream),
  });
}
