import { describe, it } from "vitest";

// NOTE: Critical path tests scaffold. These are initially skipped until
// environment stubs are confirmed. Replace with real integration wiring.

describe.skip("Chat critical path", () => {
  it("creates a chat and sends a message (smoke)", async () => {
    // TODO: Implement using test harness or repository mocks
    // 1) create chat
    // 2) send message
    // 3) assert UI/repository state transitions
  });

  it("streams assistant response and updates UI", async () => {
    // TODO: mock streaming and verify incremental updates
  });
});
