// src/lib/config/featureFlags.ts
import { DEFAULT_FEATURE_FLAGS } from "../types/unified";

export function isFeatureEnabled(
  flagName: keyof typeof DEFAULT_FEATURE_FLAGS,
  userId?: string,
): boolean {
  // Check environment variable first
  const envKey = `VITE_FF_${flagName.toUpperCase()}`;
  const envValue = import.meta.env[envKey];

  if (envValue === "false") return false;
  if (envValue === "true") return true;

  // Check rollout percentage
  const rolloutKey =
    `${flagName}RolloutPercentage` as keyof typeof DEFAULT_FEATURE_FLAGS;
  const rolloutPercentage =
    (DEFAULT_FEATURE_FLAGS[rolloutKey] as number | undefined) || 0;

  if (userId) {
    // Consistent hash for gradual rollout
    const hash = userId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return hash % 100 < rolloutPercentage;
  }

  // Random for anonymous users
  return Math.random() * 100 < rolloutPercentage;
}
