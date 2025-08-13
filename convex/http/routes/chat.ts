/**
 * Chat route handlers
 * - OPTIONS and POST /api/chat endpoints
 */

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { ModelMessage } from "ai";
import { httpAction } from "../../_generated/server";
import type { HttpRouter } from "convex/server";
import { corsResponse } from "../utils";

/**
 * Register chat routes on the HTTP router
 */
export function registerChatRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/chat
  http.route({
    path: "/api/chat",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": requested || "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }),
  });

  // POST /api/chat - Simple chat demo endpoint
  http.route({
    path: "/api/chat",
    method: "POST",
    handler: httpAction(async (_ctx, request) => {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
        );
      }
      const { messages } =
        (payload as unknown as { messages?: unknown[] }) ?? {};
      if (!Array.isArray(messages)) {
        return corsResponse(
          JSON.stringify({ error: "messages must be an array" }),
          400,
        );
      }
      const rawMessages = messages as Array<{
        role?: unknown;
        content?: unknown;
      }>;
      const coreMessages: ModelMessage[] = rawMessages.map((m) => ({
        role:
          m.role === "system" || m.role === "user" || m.role === "assistant"
            ? (m.role as "system" | "user" | "assistant")
            : "user",
        content:
          typeof m.content === "string" ? m.content : String(m.content ?? ""),
      }));

      const result = await streamText({
        model: openai("gpt-4-turbo"),
        messages: coreMessages,
      });
      // Add CORS headers to the streaming response
      const base = result.toTextStreamResponse();
      const headers = new Headers(base.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Cache-Control", "no-cache, no-transform");
      headers.set("Vary", "Origin");
      return new Response(base.body, { status: base.status, headers });
    }),
  });
}
