/**
 * UUID v7 validation utilities.
 * Keep dependency-free to avoid pulling uuidv7 into validation-only call sites.
 */

export const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV7(id: string): boolean {
  return UUID_V7_REGEX.test(id);
}
