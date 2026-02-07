/**
 * HTTP endpoints for unauthenticated API access
 * - CORS-enabled for cross-origin requests
 * - SSE streaming for AI responses
 * - Routes: /api/chat, /api/search, /api/scrape, /api/ai
 *
 * This file now serves as a central router that delegates to modular route handlers
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { registerSearchRoutes } from "./http/routes/search";
import { registerScrapeRoutes } from "./http/routes/scrape";
import { registerAgentAIRoutes } from "./http/routes/aiAgent";
import { registerPublishRoutes } from "./http/routes/publish";
import { publicCorsResponse } from "./http/cors";

/**
 * HTTP router for unauthenticated endpoints.
 *
 * Routes:
 * - POST /api/search : web search for unauthenticated users
 * - POST /api/scrape : scrape URL and return cleaned content
 * - POST /api/ai/agent/stream : Agent-based AI with SSE streaming (real-time UX)
 * - POST /api/publishChat : publish anonymous chat
 * - GET  /api/exportChat : export chat in various formats
 * - GET  /api/chatTextMarkdown : export chat as markdown
 */
const http = httpRouter();

// Register modular route handlers
registerSearchRoutes(http);
registerScrapeRoutes(http);
registerAgentAIRoutes(http); // Agent-based AI routes (SSE streaming only)
registerPublishRoutes(http);

// Register auth routes
auth.addHttpRoutes(http);

// Lightweight health check endpoint
// Health probes (load balancers, uptime monitors) don't send Origin headers,
// so publicCorsResponse serves a plain response when Origin is absent.
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const body = JSON.stringify({ status: "ok", timestamp: Date.now() });
    const origin = request.headers.get("Origin");
    return publicCorsResponse({ body, status: 200, origin });
  }),
});

export default http;
