/**
 * MSW Server Setup for Testing
 * Provides mock server for all test environments
 */

import { setupServer } from "msw/node";
import { searchHandlers } from "./search-api-mocks";

// Create MSW server with search handlers
export const server = setupServer(...searchHandlers);

// Enable API mocking before all tests
export function setupMockServer() {
  beforeAll(() => {
    server.listen({
      onUnhandledRequest: "warn", // Warn on unhandled requests during tests
    });
  });

  // Reset handlers after each test
  afterEach(() => {
    server.resetHandlers();
  });

  // Clean up after all tests
  afterAll(() => {
    server.close();
  });
}

// Utility to override handlers for specific tests
export function mockSearchResponse(
  provider: "serp" | "openrouter" | "duckduckgo",
  response: any,
  status = 200,
) {
  const { http, HttpResponse } = require("msw");

  const handlers = {
    serp: () =>
      http.get("https://serpapi.com/search", () => {
        return HttpResponse.json(response, { status });
      }),
    openrouter: () =>
      http.post("https://openrouter.ai/api/v1/chat/completions", () => {
        return HttpResponse.json(response, { status });
      }),
    duckduckgo: () =>
      http.get("https://api.duckduckgo.com/*", () => {
        if (typeof response === "string") {
          return new HttpResponse(response, {
            status,
            headers: { "Content-Type": "text/html" },
          });
        }
        return HttpResponse.json(response, { status });
      }),
  };

  const handler = handlers[provider];
  if (handler) {
    server.use(handler());
  }
}
