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

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    results.push(path);
    return results;
  }

  for (const key of keys) {
    results.push(...findEmptyObjects((obj as Record<string, unknown>)[key], `${path}.${key}`));
  }

  return results;
}

/**
 * Recursively remove all empty objects from a structure
 */
export function removeEmptyObjects<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .map((item) => removeEmptyObjects(item))
      .filter((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return Object.keys(item).length > 0;
        }
        return true;
      }) as T;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        // Skip empty objects
        continue;
      }
    }

    cleaned[key] = removeEmptyObjects(value);
  }

  return cleaned as T;
}
