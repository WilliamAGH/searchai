/**
 * Browser-compatible signature verification for agent workflow payloads
 *
 * Uses Web Crypto API (available in all modern browsers)
 * Verifies HMAC-SHA256 signatures from backend
 */

// Import PersistedPayload from the single source of truth
import type { PersistedPayload } from "@/lib/types/message";

export type PersistedPayloadWire = Omit<
  PersistedPayload,
  "assistantMessageId"
> & {
  assistantMessageId: string;
};

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a signature for a persisted payload using Web Crypto API
 *
 * @param payload - The persisted payload to verify
 * @param nonce - Nonce from the workflow
 * @param signature - Hex-encoded signature to verify
 * @param signingKey - HMAC signing key (from env)
 * @returns Promise<boolean> - true if signature is valid
 */
export async function verifyPersistedPayload(
  payload: PersistedPayloadWire,
  nonce: string,
  signature: string,
  signingKey: string,
): Promise<boolean> {
  try {
    // Serialize payload + nonce (must match backend serialization)
    const body = JSON.stringify({ payload, nonce });
    const encoder = new TextEncoder();
    const data = encoder.encode(body);

    // Import signing key
    const keyData = encoder.encode(signingKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    // Generate expected signature
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const expectedSignature = bytesToHex(new Uint8Array(signatureBuffer));

    // Constant-time comparison
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return mismatch === 0;
  } catch (error) {
    console.error("[BLOCKED] Signature verification failed:", error);
    return false;
  }
}

/**
 * Check if signature verification is available
 * @returns true if Web Crypto API is available
 */
export function isSignatureVerificationAvailable(): boolean {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof crypto.subtle.importKey === "function"
  );
}
