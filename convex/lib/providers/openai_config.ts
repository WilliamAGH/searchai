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
export const parseOpenRouterProvider = (): OpenRouterProvider | undefined => {
  const sort = process.env.LLM_PROVIDER_SORT as "price" | "throughput" | "latency" | undefined;
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

  if (allowFallbacks !== undefined) {
    provider.allow_fallbacks = allowFallbacks === "true" || allowFallbacks === "1";
  } else {
    // Default to allowing fallbacks for better reliability
    provider.allow_fallbacks = true;
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
export const parseReasoningSettings = (): ModelSettings["reasoning"] | undefined => {
  const reasoningEffort = process.env.LLM_REASONING as
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | undefined;

  if (!reasoningEffort) {
    return undefined;
  }

  // Validate the reasoning effort value
  const validEfforts = ["minimal", "low", "medium", "high"];
  if (!validEfforts.includes(reasoningEffort)) {
    console.warn(
      `[openai-client] Invalid LLM_REASONING value: ${reasoningEffort}. Must be one of: ${validEfforts.join(", ")}`,
    );
    return undefined;
  }

  return {
    effort: reasoningEffort,
  };
};
