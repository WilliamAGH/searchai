/**
 * MSW Setup for Vitest
 * Initializes mock server for all tests
 */

import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "./server";

// Start server before all tests
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
