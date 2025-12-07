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
import { generateMessageId } from "../id_generator";

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
 * Shared OpenAI environment configuration
 */
export interface OpenAIEnvironment {
  client: OpenAI;
  isOpenAIEndpoint: boolean;
  defaultModelSettings: Partial<ModelSettings>;
}

/**
 * Type guards for request payload inspection
 */
type FunctionCallOutputItem = Record<string, unknown> & {
  type: "function_call_output";
  id?: string;
};

type InstrumentedRequestPayload = Record<string, unknown> & {
  input: unknown[];
};

const isFunctionCallOutputItem = (
  value: unknown,
): value is FunctionCallOutputItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    candidate.type === "function_call_output"
  );
};

const isInstrumentedRequestPayload = (
  value: unknown,
): value is InstrumentedRequestPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.input);
};

/**
 * Parse OpenRouter provider configuration from environment variables
 * Supports LLM_PROVIDER_SORT, LLM_PROVIDER_ORDER, LLM_PROVIDER_ALLOW_FALLBACKS
 * @see https://openrouter.ai/docs/features/provider-routing
 */
const parseOpenRouterProvider = (): OpenRouterProvider | undefined => {
  const sort = process.env.LLM_PROVIDER_SORT as
    | "price"
    | "throughput"
    | "latency"
    | undefined;
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
    provider.allow_fallbacks =
      allowFallbacks === "true" || allowFallbacks === "1";
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
const parseReasoningSettings = (): ModelSettings["reasoning"] | undefined => {
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

/**
 * Wrap the native fetch to inject IDs for function_call_output items
 * and optionally dump payloads when debugging
 */
const SENSITIVE_HEADER_PATTERN =
  /^(authorization|x[-_]api[-_]key|api[-_]key)$/i;

const redactSensitiveHeaders = (
  headers: HeadersInit | undefined | null,
): Record<string, string> | undefined => {
  if (!headers) {
    return undefined;
  }

  const entries: Array<[string, string]> = (() => {
    if (headers instanceof Headers) {
      return Array.from(headers.entries());
    }
    if (Array.isArray(headers)) {
      // Only process inner arrays with at least 2 elements; skip or warn on malformed entries
      return headers
        .filter((arr) => Array.isArray(arr) && arr.length >= 2)
        .map(([key, value]) => [key, String(value)]);
    }
    return Object.entries(headers).map(([key, value]) => [key, String(value)]);
  })();

  const redacted: Record<string, string> = {};
  for (const [key, value] of entries) {
    redacted[key] = SENSITIVE_HEADER_PATTERN.test(key) ? "REDACTED" : value;
  }
  return redacted;
};

const createInstrumentedFetch = (debugLogging: boolean): typeof fetch => {
  const instrumented = async (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => {
    const [input, init] = args;
    const clonedInit: RequestInit = init ? { ...init } : {};
    let bodyText: string | undefined;
    let parsedBody: unknown;

    if (clonedInit.body && typeof clonedInit.body === "string") {
      bodyText = clonedInit.body;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch (error) {
        if (debugLogging) {
          console.error("[llm-debug] Failed to parse request body", error);
        }
      }
    }

    // Inject IDs for function_call_output items (required by Responses API)
    if (isInstrumentedRequestPayload(parsedBody)) {
      let mutated = false;
      for (const item of parsedBody.input) {
        if (!isFunctionCallOutputItem(item)) {
          continue;
        }
        if (typeof item.id !== "string" || item.id.length === 0) {
          item.id = generateMessageId();
          mutated = true;
        }
      }
      if (mutated) {
        if (debugLogging) {
          console.error("[llm-debug] Added IDs to function_call_output items");
        }
        bodyText = JSON.stringify(parsedBody);
        clonedInit.body = bodyText;
      }
    }

    if (debugLogging) {
      try {
        if (!bodyText && clonedInit.body) {
          bodyText =
            typeof clonedInit.body === "string"
              ? clonedInit.body
              : await new Response(clonedInit.body).text();
        }
        console.error("[llm-debug] ========== OUTGOING REQUEST ==========");
        console.error("[llm-debug] URL:", input);
        console.error(
          "[llm-debug] Headers:",
          JSON.stringify(
            redactSensitiveHeaders(clonedInit.headers) ?? {},
            null,
            2,
          ),
        );
        console.error(
          "[llm-debug] Body:",
          bodyText ? JSON.stringify(JSON.parse(bodyText), null, 2) : "",
        );
        console.error("[llm-debug] =====================================");
      } catch (error) {
        console.error("[llm-debug] Failed to log request", error);
      }
    }

    const response = await fetch(input, clonedInit);

    if (debugLogging) {
      try {
        const responseClone = response.clone();
        const responseText = await responseClone.text();
        console.error("[llm-debug] ========== INCOMING RESPONSE ==========");
        console.error(
          "[llm-debug] Status:",
          response.status,
          response.statusText,
        );
        console.error(
          "[llm-debug] Headers:",
          JSON.stringify(
            redactSensitiveHeaders(
              Object.fromEntries(response.headers.entries()),
            ) ?? {},
            null,
            2,
          ),
        );
        console.error(
          "[llm-debug] Body:",
          responseText ? JSON.stringify(JSON.parse(responseText), null, 2) : "",
        );
        console.error("[llm-debug] ======================================");
      } catch (error) {
        console.error("[llm-debug] Failed to log response", error);
      }
    }

    return response;
  };

  return instrumented as typeof fetch;
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
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY;
  const normalizedBase = baseURL?.toLowerCase();
  const isOpenAIEndpoint = normalizedBase
    ? normalizedBase.includes("api.openai.com")
    : true;
  // Detect OpenRouter and other non-OpenAI providers that use Chat Completions API
  const isOpenRouter = normalizedBase?.includes("openrouter") ?? false;
  const isChatCompletionsEndpoint =
    normalizedBase?.includes("/chat/completions") ?? false;
  // Use Chat Completions API for OpenRouter and any endpoint with /chat/completions
  // OpenAI's Responses API is only supported by api.openai.com
  const useChatCompletionsAPI = isOpenRouter || isChatCompletionsEndpoint;
  const debugLogging = process.env.LLM_DEBUG_FETCH === "1";

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
