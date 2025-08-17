/**
 * HTTP endpoints for unauthenticated API access
 * - CORS-enabled for cross-origin requests
 * - SSE streaming for AI responses
 * - Fallback handling for missing APIs
 * - Routes: /api/chat, /api/search, /api/scrape, /api/ai
 *
 * This file now serves as a central router that delegates to modular route handlers
 */

import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerChatRoutes } from "./http/routes/chat";
import { registerSearchRoutes } from "./http/routes/search";
import { registerScrapeRoutes } from "./http/routes/scrape";
import { registerAIRoutes } from "./http/routes/ai";
import { registerPublishRoutes } from "./http/routes/publish";
import { registerHealthRoutes } from "./http/routes/health";

/**
 * HTTP router for unauthenticated endpoints.
 *
 * Routes:
 * - POST /api/chat   : simple chat demo endpoint
 * - POST /api/search : web search for unauthenticated users
 * - POST /api/scrape : scrape URL and return cleaned content
 * - POST /api/ai     : AI generation with SSE streaming
 * - POST /api/publishChat : publish anonymous chat
 * - GET  /api/exportChat : export chat in various formats
 * - GET  /api/chatTextMarkdown : export chat as markdown
 */
const http = httpRouter();

// Register modular route handlers
registerChatRoutes(http);
registerSearchRoutes(http);
registerScrapeRoutes(http);
registerAIRoutes(http);
registerPublishRoutes(http);
registerHealthRoutes(http);

// Register auth routes
auth.addHttpRoutes(http);

export default http;
