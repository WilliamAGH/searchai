import { isRecord } from "./validators";

/**
 * Deep object inspector to find empty objects {}
 * Returns paths to all empty objects in the structure
 */
export function findEmptyObjects(obj: unknown, path = "root"): string[] {
  const results: string[] = [];

  if (obj === null || obj === undefined) {
    return results;
  }

  if (typeof obj !== "object") {
    return results;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      results.push(...findEmptyObjects(item, `${path}[${index}]`));
    });
    return results;
  }

  if (!isRecord(obj)) {
    return results;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    results.push(path);
    return results;
  }

  for (const key of keys) {
    results.push(...findEmptyObjects(obj[key], `${path}.${key}`));
  }

  return results;
}

/**
 * Recursively remove all empty objects from a structure.
 * Returns unknown: the transform removes keys/elements so the output
 * is a structural subset that cannot be typed as the original T.
 */
export function removeEmptyObjects(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .map((item) => removeEmptyObjects(item))
      .filter((item) => {
        if (isRecord(item)) {
          return Object.keys(item).length > 0;
        }
        return true;
      });
  }

  if (!isRecord(obj)) {
    return obj;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (isRecord(value) && Object.keys(value).length === 0) {
      continue;
    }

    cleaned[key] = removeEmptyObjects(value);
  }

  return cleaned;
}
