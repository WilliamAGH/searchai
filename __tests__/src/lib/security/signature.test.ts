import { describe, expect, it } from "vitest";
import {
  verifyPersistedPayload,
  type PersistedPayloadWire,
} from "../../../../src/lib/security/signature";

const encoder = new TextEncoder();

async function signPayload(
  payload: PersistedPayloadWire,
  nonce: string,
  signingKey: string,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API unavailable in test environment");
  }
  const data = encoder.encode(JSON.stringify({ payload, nonce }));
  const keyData = encoder.encode(signingKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const hasCryptoSubtle = Boolean(globalThis.crypto?.subtle);

describe("verifyPersistedPayload", () => {
  const payload: PersistedPayloadWire = {
    assistantMessageId: "msg_1",
    workflowId: "019a122e-c507-7851-99f7-b8f5d7345b40",
    answer: "Example",
    sources: ["anthropic.com"],
    contextReferences: [],
  };
  const nonce = "019a122e-c507-7851-99f7-b8f5d7345b41";
  const signingKey = "test-signing-key";

  it.skipIf(!hasCryptoSubtle)("accepts matching signatures", async () => {
    const signature = await signPayload(payload, nonce, signingKey);
    await expect(verifyPersistedPayload(payload, nonce, signature, signingKey)).resolves.toBe(true);
  });

  it.skipIf(!hasCryptoSubtle)("rejects tampered payloads", async () => {
    const signature = await signPayload(payload, nonce, signingKey);
    const tamperedPayload = { ...payload, answer: "Tampered" };
    await expect(
      verifyPersistedPayload(tamperedPayload, nonce, signature, signingKey),
    ).resolves.toBe(false);
  });
});
