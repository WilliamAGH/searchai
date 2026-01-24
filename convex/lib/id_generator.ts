/**
 * UUID v7 ID Generation Utilities
 *
 * Generates time-ordered UUIDs (RFC 4122 draft) for:
 * - Message IDs: Unique identifier for each message in a conversation
 * - Thread IDs: Unique identifier for conversation threads
 *
 * Benefits:
 * - Chronologically sortable (timestamp embedded in UUID)
 * - Better database performance (sequential IDs)
 * - Globally unique across distributed systems
 * - Compatible with standard UUID tooling
 *
 * Compatible with both Convex V8 runtime and Node.js runtime
 * Port of data-tools-bun/tools/shared/id-generator.ts
 */

/**
 * Get crypto implementation based on runtime
 * - V8 runtime (queries/mutations): uses global crypto
 * - Node.js runtime (actions with "use node"): uses node:crypto webcrypto
 */
function getCrypto(): Crypto {
  // Check if we're in Node.js runtime
  if (
    typeof globalThis.process !== "undefined" &&
    globalThis.process.versions?.node
  ) {
    // Node.js runtime - use webcrypto from node:crypto
    // Note: This is dynamically imported to avoid bundling issues
    const nodeRequire = typeof require !== "undefined" ? require : undefined;
    if (nodeRequire) {
      try {
        const { webcrypto } = nodeRequire("crypto") as { webcrypto: Crypto };
        return webcrypto;
      } catch (error) {
        console.warn("Failed to load node:crypto webcrypto", { error });
        // Fallback to global crypto if available
      }
    }
  }
  // V8 runtime or browser - use global crypto
  return crypto;
}

/**
 * Generate random bytes using runtime-appropriate crypto
 * Works in both Convex V8 runtime and Node.js runtime
 */
function getRandomBytes(length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  const cryptoImpl = getCrypto();
  cryptoImpl.getRandomValues(buffer);
  return buffer;
}

/**
 * Read a 16-bit unsigned big-endian integer from Uint8Array
 */
function readUInt16BE(buffer: Uint8Array, offset: number): number {
  return (buffer[offset]! << 8) | buffer[offset + 1]!;
}

/**
 * Read a 64-bit unsigned big-endian BigInt from Uint8Array
 */
function readBigUInt64BE(buffer: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result = (result << 8n) | BigInt(buffer[i]!);
  }
  return result;
}

/**
 * Generate a time-ordered UUID v7 (RFC 4122 draft)
 *
 * Structure:
 * - 48 bits: Unix timestamp in milliseconds
 * - 4 bits: Version (0111 = 7)
 * - 12 bits: Random data A
 * - 2 bits: Variant (10)
 * - 62 bits: Random data B
 *
 * @returns UUID v7 string (e.g., "018e5e5e-5e5e-7abc-8def-0123456789ab")
 */
export function uuidV7(): string {
  // 48-bit timestamp (milliseconds since epoch, masked to 48 bits)
  const ts = BigInt(Date.now()) & 0xffffffffffffn;

  // 12-bit random A
  const randomA = readUInt16BE(getRandomBytes(2), 0) & 0x0fff;

  // MSB: 48-bit timestamp | 4-bit version (7) | 12-bit random A
  const msb = (ts << 16n) | (0x7n << 12n) | BigInt(randomA);

  // 64-bit random B
  const randomBBytes = getRandomBytes(8);
  const randomB = readBigUInt64BE(randomBBytes);

  // LSB: 2-bit variant (10) | 62-bit random B
  const lsb = (randomB & 0x3fffffffffffffffn) | 0x8000000000000000n;

  return formatUUID(msb, lsb);
}

/**
 * Format a UUID from two 64-bit values (MSB and LSB)
 * @param msb Most significant 64 bits
 * @param lsb Least significant 64 bits
 * @returns Formatted UUID string (8-4-4-4-12 format)
 */
function formatUUID(msb: bigint, lsb: bigint): string {
  const hex = (value: bigint, length: number): string => {
    return value.toString(16).padStart(length, "0");
  };

  // Extract components from MSB (64 bits)
  const timeLow = (msb >> 32n) & 0xffffffffn; // 32 bits
  const timeMid = (msb >> 16n) & 0xffffn; // 16 bits
  const timeHiAndVersion = msb & 0xffffn; // 16 bits

  // Extract components from LSB (64 bits)
  const clockSeqAndVariant = (lsb >> 48n) & 0xffffn; // 16 bits
  const node = lsb & 0xffffffffffffn; // 48 bits

  return `${hex(timeLow, 8)}-${hex(timeMid, 4)}-${hex(timeHiAndVersion, 4)}-${hex(clockSeqAndVariant, 4)}-${hex(node, 12)}`;
}

/**
 * Generate a message ID (UUID v7)
 *
 * Used for individual messages within a conversation thread.
 * Each message gets a unique, time-ordered ID.
 *
 * @returns Time-ordered UUID for message tracking
 */
export function generateMessageId(): string {
  return uuidV7();
}

/**
 * Generate a thread ID (UUID v7)
 *
 * Used for conversation threads/sessions.
 * All messages in a thread share the same thread ID.
 *
 * @returns Time-ordered UUID for thread tracking
 */
export function generateThreadId(): string {
  return uuidV7();
}

/**
 * Generate a conversation ID (alias for generateThreadId)
 *
 * @returns Time-ordered UUID for conversation tracking
 */
export function generateConversationId(): string {
  return uuidV7();
}
