"use node";
/**
 * Shared OpenAI Provider Library
 *
 * Modern integration using:
 * - @openai/agents for Responses API
 * - UUID v7 for message and thread IDs
 * - OpenRouter compatibility with provider routing
 * - Reasoning token support (o1, o3, gpt-5 models)
 * - Comprehensive environment variable configuration
 *
 * Based on data-tools-bun reference implementation
 */

import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setDefaultOpenAITracingExporter,
  OpenAIProvider,
} from "@openai/agents-openai";
import {
  setTraceProcessors,
  setDefaultModelProvider,
  type ModelSettings,
} from "@openai/agents-core";
import OpenAI from "openai";

import { createInstrumentedFetch } from "./fetch_instrumentation";
import {
  parseOpenRouterProvider,
  parseReasoningSettings,
} from "./openai_config";
import { scheduleOpenAIHealthCheck } from "./openai_health";
import { resolveOpenAIApiKey, resolveOpenAIEndpoint } from "./openai_resolver";
import type {
  OpenRouterBody as LegacyOpenRouterBody,
  OpenRouterMessage as LegacyOpenRouterMessage,
} from "./openrouter_types";

export type {
  LegacyOpenRouterBody as OpenRouterBody,
  LegacyOpenRouterMessage as OpenRouterMessage,
};

/**
 * Shared OpenAI environment configuration
 */
export interface OpenAIEnvironment {
  client: OpenAI;
  isOpenAIEndpoint: boolean;
  apiMode: "chat_completions" | "responses";
  defaultModelSettings: Partial<ModelSettings>;
}

/**
 * Create an OpenAI-compatible environment configured from env vars
 * Handles model endpoint detection, tracing toggles, and debugging instrumentation
 *
 * Environment variables (with fallback chain):
 * - LLM_BASE_URL / OPENAI_BASE_URL / OPENROUTER_BASE_URL
 * - LLM_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY
 * - LLM_MODEL / OPENAI_MODEL (default: gpt-4o-mini)
 * - LLM_TEMPERATURE (default: 0.5)
 * - LLM_MAX_OUTPUT_TOKENS (optional)
 * - LLM_REASONING (minimal/low/medium/high)
 * - LLM_PROVIDER_SORT (price/throughput/latency)
 * - LLM_PROVIDER_ORDER (comma-separated list, default: novita)
 * - LLM_PROVIDER_ALLOW_FALLBACKS (true/false, default: true)
 * - LLM_DEBUG_FETCH (1 to enable request/response logging)
 */
export const createOpenAIEnvironment = (): OpenAIEnvironment => {
  const endpoint = resolveOpenAIEndpoint();
  const { baseURL, isOpenRouter, isOpenAIEndpoint, isChatCompletionsEndpoint } =
    endpoint;
  const apiKey = resolveOpenAIApiKey(endpoint);

  if (!apiKey) {
    throw new Error(
      "No API key configured. Set LLM_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY",
    );
  }

  // Default rules:
  // - OpenAI (api.openai.com): prefer Responses API.
  // - OpenAI-compatible endpoints (OpenRouter, xAI, etc.): default to Chat Completions.
  // - Explicit baseURL overrides (ending in /chat/completions): force Chat Completions.
  const useChatCompletionsAPI =
    !isOpenAIEndpoint || isOpenRouter || isChatCompletionsEndpoint;
  const apiMode: OpenAIEnvironment["apiMode"] = useChatCompletionsAPI
    ? "chat_completions"
    : "responses";
  const debugLogging = process.env.LLM_DEBUG_FETCH === "1";
  const configuredModel =
    process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const client = new OpenAI({
    apiKey,
    baseURL,
    fetch: createInstrumentedFetch({ debugLogging }),
  });

  // Configure API type based on endpoint
  // CRITICAL: OpenRouter only supports Chat Completions API, NOT Responses API
  // Using the wrong API format causes tool definitions to be ignored/malformed
  if (apiMode === "chat_completions") {
    setOpenAIAPI("chat_completions");
    console.info(
      "API Mode: chat_completions",
      isOpenRouter ? "(OpenRouter detected)" : "(explicit endpoint)",
    );
  } else {
    setOpenAIAPI("responses");
    console.info("API Mode: responses (OpenAI endpoint)");
  }

  // Configure tracing (only for OpenAI endpoints)
  if (!isOpenAIEndpoint) {
    process.env.OPENAI_AGENTS_DISABLE_TRACING = "1";
    setTraceProcessors([]);
  } else {
    delete process.env.OPENAI_AGENTS_DISABLE_TRACING;
    setDefaultOpenAITracingExporter();
  }

  setDefaultOpenAIClient(client);

  // CRITICAL: Create and set the default model provider
  // useResponses must be FALSE for OpenRouter - it only supports Chat Completions API
  // Using useResponses:true with OpenRouter causes tool definitions to be sent incorrectly,
  // resulting in the model hallucinating tool outputs instead of actually calling tools
  const modelProvider = new OpenAIProvider({
    openAIClient: client,
    useResponses: apiMode === "responses",
  });
  setDefaultModelProvider(modelProvider);
  console.info(
    "ModelProvider useResponses:",
    apiMode === "responses",
    apiMode === "chat_completions"
      ? "(disabled for Chat Completions)"
      : "(enabled for Responses API)",
  );

  // Validate OpenAI credentials + model on startup (once per runtime)
  scheduleOpenAIHealthCheck({
    client,
    model: configuredModel,
    isOpenAIEndpoint,
  });

  // Build default model settings
  const temperature = process.env.LLM_TEMPERATURE
    ? Number.parseFloat(process.env.LLM_TEMPERATURE)
    : 0.5;
  const maxOutputTokens = process.env.LLM_MAX_OUTPUT_TOKENS
    ? Number.parseInt(process.env.LLM_MAX_OUTPUT_TOKENS, 10)
    : undefined;
  const provider = parseOpenRouterProvider();
  const reasoning = parseReasoningSettings();

  console.info("parseOpenRouterProvider returned:", JSON.stringify(provider));
  console.info("parseReasoningSettings returned:", JSON.stringify(reasoning));

  const defaultModelSettings: Partial<ModelSettings> = {
    temperature,
  };

  // Add max_output_tokens if specified
  if (
    maxOutputTokens &&
    !Number.isNaN(maxOutputTokens) &&
    maxOutputTokens > 0
  ) {
    defaultModelSettings.maxTokens = maxOutputTokens;
  }

  // Add reasoning configuration if specified (for reasoning models like o1, o3)
  if (reasoning) {
    defaultModelSettings.reasoning = reasoning;
  }

  // Add provider routing configuration if specified (for OpenRouter)
  if (provider) {
    defaultModelSettings.providerData = {
      provider,
    };
  }

  console.info(
    "Final defaultModelSettings:",
    JSON.stringify(defaultModelSettings),
  );

  return {
    client,
    isOpenAIEndpoint,
    apiMode,
    defaultModelSettings,
  };
};

/**
 * Get the configured model name from environment
 */
export const getModelName = (): string => {
  return process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
};

/**
 * Get the configured model name for multimodal (vision) requests.
 *
 * This MUST be a vision-capable model. Defaulting to LLM_MODEL is unsafe because
 * many text-first models will accept the request but ignore images (leading to
 * confident hallucinations).
 */
export const getVisionModelName = (): string => {
  return (
    process.env.LLM_VISION_MODEL ||
    process.env.OPENAI_VISION_MODEL ||
    "gpt-4o-mini"
  );
};

/**
 * Check if current configuration is using OpenRouter
 */
export const isOpenRouterEndpoint = (): boolean => {
  return resolveOpenAIEndpoint().isOpenRouter;
};

/**
 * Cached OpenAI environment singleton
 * Ensures createOpenAIEnvironment is only called once per runtime
 */
let cachedOpenAIEnvironment: OpenAIEnvironment | null = null;

export const resetOpenAIEnvironmentForTests = (): void => {
  if (process.env.NODE_ENV !== "test") return;
  cachedOpenAIEnvironment = null;
};

/**
 * Get the singleton OpenAI environment, creating it if necessary
 * This is the preferred way to access the OpenAI client and settings
 */
export const getOpenAIEnvironment = (): OpenAIEnvironment => {
  if (cachedOpenAIEnvironment) return cachedOpenAIEnvironment;
  cachedOpenAIEnvironment = createOpenAIEnvironment();
  return cachedOpenAIEnvironment;
};
