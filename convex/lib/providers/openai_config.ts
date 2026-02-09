"use node";

import type { ModelSettings } from "@openai/agents-core";

/**
 * OpenRouter provider routing configuration
 * @see https://openrouter.ai/docs/features/provider-routing
 */
export interface OpenRouterProvider {
  /** Sort providers by: price, throughput, or latency */
  sort?: "price" | "throughput" | "latency";
  /** Explicitly order specific providers (e.g., ["anthropic", "openai"]) */
  order?: string[];
  /** Allow fallback to other providers if the primary fails */
  allow_fallbacks?: boolean;
}

/**
 * Reasoning configuration for o1, o3, gpt-5 models
 * @see https://platform.openai.com/docs/guides/reasoning
 * @see https://openrouter.ai/docs/use-cases/reasoning-tokens
 */
export interface ReasoningConfig {
  /** Reasoning effort level: minimal (OpenAI only), low, medium, high */
  effort: "minimal" | "low" | "medium" | "high";
}

/**
 * Parse OpenRouter provider configuration from environment variables
 * Supports LLM_PROVIDER_SORT, LLM_PROVIDER_ORDER, LLM_PROVIDER_ALLOW_FALLBACKS
 * @see https://openrouter.ai/docs/features/provider-routing
 */
const isValidSort = (s: string): s is "price" | "throughput" | "latency" => {
  return ["price", "throughput", "latency"].includes(s);
};

export const parseOpenRouterProvider = (): OpenRouterProvider | undefined => {
  const sortEnv = process.env.LLM_PROVIDER_SORT;
  const sort = sortEnv && isValidSort(sortEnv) ? sortEnv : undefined;

  const orderRaw = process.env.LLM_PROVIDER_ORDER;
  const allowFallbacks = process.env.LLM_PROVIDER_ALLOW_FALLBACKS;

  // Only configure provider routing if we have any provider settings
  // Empty objects {} are not supported by Convex
  const hasProviderConfig = sort || orderRaw || allowFallbacks !== undefined;

  if (!hasProviderConfig) {
    return undefined;
  }

  const provider: OpenRouterProvider = {};

  if (sort) {
    provider.sort = sort;
  }

  if (orderRaw) {
    provider.order = orderRaw.split(",").map((p) => p.trim());
  } else {
    // Default to novita provider when using OpenRouter
    provider.order = ["novita"];
  }

  if (allowFallbacks === undefined) {
    provider.allow_fallbacks = true;
  } else {
    provider.allow_fallbacks =
      allowFallbacks === "true" || allowFallbacks === "1";
  }

  return provider;
};

/**
 * Parse reasoning configuration from environment variables
 * Supports LLM_REASONING for effort levels: 'minimal', 'low', 'medium', 'high'
 *
 * Reasoning effort controls token allocation for reasoning models:
 * - 'high' allocates ~80% of max_output_tokens for reasoning
 * - 'medium' allocates ~50% of max_output_tokens for reasoning
 * - 'low' allocates ~20% of max_output_tokens for reasoning
 * - 'minimal' uses minimal reasoning tokens (OpenAI only)
 *
 * @see https://platform.openai.com/docs/guides/reasoning
 * @see https://openrouter.ai/docs/use-cases/reasoning-tokens
 */
const isValidReasoningEffort = (
  s: string,
): s is "minimal" | "low" | "medium" | "high" => {
  return ["minimal", "low", "medium", "high"].includes(s);
};

export const parseReasoningSettings = ():
  | ModelSettings["reasoning"]
  | undefined => {
  const reasoningEffort = process.env.LLM_REASONING;

  if (!reasoningEffort) {
    return undefined;
  }

  // Validate the reasoning effort value
  if (!isValidReasoningEffort(reasoningEffort)) {
    console.warn(
      `[openai-client] Invalid LLM_REASONING value: ${reasoningEffort}. Must be one of: minimal, low, medium, high`,
    );
    return undefined;
  }

  return {
    effort: reasoningEffort,
  };
};
