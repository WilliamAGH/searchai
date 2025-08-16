import { setupWorker } from "msw/browser";
import { searchHandlers } from "./search-api-mocks";

// Create browser worker for Playwright E2E tests
export const worker = setupWorker(...searchHandlers);

// Export setup function for Playwright tests
export async function setupMSWForBrowser() {
  // Start the worker
  await worker.start({
    onUnhandledRequest: "warn", // Warn about unhandled requests
    serviceWorker: {
      url: "/mockServiceWorker.js", // Default MSW service worker path
    },
  });

  console.log("🔧 MSW Browser Worker started for E2E tests");
  return worker;
}

// Export cleanup function
export async function cleanupMSWForBrowser() {
  await worker.stop();
  console.log("🧹 MSW Browser Worker stopped");
}
