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
import { getErrorMessage } from "../errors";

import { createInstrumentedFetch } from "../fetchUtils";
import {
  parseOpenRouterProvider,
  parseReasoningSettings,
} from "./openai_config";

/**
 * Shared OpenAI environment configuration
 */
export interface OpenAIEnvironment {
  client: OpenAI;
  isOpenAIEndpoint: boolean;
  defaultModelSettings: Partial<ModelSettings>;
}

/**
 * Wrap the native fetch to inject IDs for function_call_output items
 * and optionally dump payloads when debugging
 */

const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 8000;
let healthCheckPromise: Promise<void> | null = null;

const scheduleOpenAIHealthCheck = (params: {
  client: OpenAI;
  model: string;
  isOpenAIEndpoint: boolean;
}) => {
  if (!params.isOpenAIEndpoint) return;
  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) return;
  if (process.env.LLM_HEALTHCHECK === "0") return;
  if (healthCheckPromise) return;

  const timeoutMs = Number.parseInt(
    process.env.LLM_HEALTHCHECK_TIMEOUT_MS || "",
    10,
  );
  const maxWait =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_HEALTHCHECK_TIMEOUT_MS;

  const run = async () => {
    const start = Date.now();
    try {
      const check = params.client.responses.create({
        model: params.model,
        input: "healthcheck",
        max_output_tokens: 1,
      });
      await Promise.race([
        check,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), maxWait),
        ),
      ]);
      console.info(
        "✅ OpenAI health check passed",
        `${params.model} (${Date.now() - start}ms)`,
      );
    } catch (error) {
      console.error("❌ OpenAI health check failed", {
        model: params.model,
        error: getErrorMessage(error),
      });
    }
  };

  healthCheckPromise = run();
};

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
  const baseURL =
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.OPENROUTER_BASE_URL;
  const normalizedBase = baseURL?.toLowerCase();

  // Detect endpoint type BEFORE selecting API key to enable smart matching
  const isOpenRouter = normalizedBase?.includes("openrouter") ?? false;
  const isOpenAIEndpoint = normalizedBase
    ? normalizedBase.includes("api.openai.com")
    : true;

  // Select API key with endpoint-aware fallback:
  // 1. LLM_API_KEY always takes precedence (explicit override)
  // 2. For OpenRouter endpoints, prefer OPENROUTER_API_KEY over OPENAI_API_KEY
  // 3. For OpenAI endpoints, prefer OPENAI_API_KEY over OPENROUTER_API_KEY
  // This prevents misconfiguration where the wrong provider's key is sent
  const apiKey =
    process.env.LLM_API_KEY ||
    (isOpenRouter
      ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
      : process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);

  if (!apiKey) {
    throw new Error(
      "No API key configured. Set LLM_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY",
    );
  }

  const isChatCompletionsEndpoint =
    normalizedBase?.includes("/chat/completions") ?? false;
  // Use Chat Completions API for OpenRouter and any endpoint with /chat/completions
  // OpenAI's Responses API is only supported by api.openai.com
  const useChatCompletionsAPI = isOpenRouter || isChatCompletionsEndpoint;
  const debugLogging = process.env.LLM_DEBUG_FETCH === "1";
  const configuredModel =
    process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const client = new OpenAI({
    apiKey,
    baseURL,
    fetch: createInstrumentedFetch(debugLogging),
  });

  // Configure API type based on endpoint
  // CRITICAL: OpenRouter only supports Chat Completions API, NOT Responses API
  // Using the wrong API format causes tool definitions to be ignored/malformed
  if (useChatCompletionsAPI) {
    setOpenAIAPI("chat_completions");
    console.info(
      "🔧 API Mode: chat_completions",
      isOpenRouter ? "(OpenRouter detected)" : "(explicit endpoint)",
    );
  } else {
    setOpenAIAPI("responses");
    console.info("🔧 API Mode: responses (OpenAI endpoint)");
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
    useResponses: !useChatCompletionsAPI, // Only use Responses API with OpenAI
  });
  setDefaultModelProvider(modelProvider);
  console.info(
    "🔧 ModelProvider useResponses:",
    !useChatCompletionsAPI,
    useChatCompletionsAPI
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

  console.info(
    "🔍 parseOpenRouterProvider returned:",
    JSON.stringify(provider),
  );
  console.info(
    "🔍 parseReasoningSettings returned:",
    JSON.stringify(reasoning),
  );

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
    "🔍 Final defaultModelSettings:",
    JSON.stringify(defaultModelSettings),
  );

  return {
    client,
    isOpenAIEndpoint,
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
 * Check if current configuration is using OpenRouter
 */
export const isOpenRouterEndpoint = (): boolean => {
  const baseURL =
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.OPENROUTER_BASE_URL;
  return baseURL?.toLowerCase().includes("openrouter") || false;
};

/**
 * Legacy compatibility: OpenRouter message format
 * Used for backward compatibility with existing streaming.ts
 */
export interface OpenRouterMessage {
  role: string;
  content: string;
  cache_control?: { type: string };
}

/**
 * Legacy compatibility: OpenRouter request body
 */
export interface OpenRouterBody {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_tokens: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}
