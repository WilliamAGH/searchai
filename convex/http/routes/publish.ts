/**
 * Publish and export route handlers
 * - POST /api/publishChat
 * - GET /api/exportChat and /api/chatTextMarkdown
 */

import { httpAction } from "../../_generated/server";
import type { HttpRouter } from "convex/server";
import { buildCorsPreflightResponse } from "./publish_cors";
import { handlePublishChat } from "./publish_chat";
import { handleExportChat } from "./publish_export";
import { handleChatTextMarkdown } from "./publish_text";

/**
 * Register publish and export routes on the HTTP router
 */
export function registerPublishRoutes(http: HttpRouter) {
  // CORS preflight for /api/publishChat
  http.route({
    path: "/api/publishChat",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      return buildCorsPreflightResponse(request, "POST, OPTIONS");
    }),
  });

  // POST /api/publishChat - Publish anonymous chat
  http.route({
    path: "/api/publishChat",
    method: "POST",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      return handlePublishChat(ctx, request);
    }),
  });

  // CORS preflight for /api/exportChat
  http.route({
    path: "/api/exportChat",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      return buildCorsPreflightResponse(request, "GET, OPTIONS");
    }),
  });

  // GET /api/exportChat - Export chat in various formats
  http.route({
    path: "/api/exportChat",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      return handleExportChat(ctx, request);
    }),
  });

  // CORS preflight for /api/chatTextMarkdown
  http.route({
    path: "/api/chatTextMarkdown",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request): Promise<Response> => {
      return buildCorsPreflightResponse(request, "GET, OPTIONS");
    }),
  });

  // GET /api/chatTextMarkdown - Export chat as plain text Markdown
  http.route({
    path: "/api/chatTextMarkdown",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      return handleChatTextMarkdown(ctx, request);
    }),
  });
}
