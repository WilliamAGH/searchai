"use node";

/**
 * OpenAI/OpenRouter Streaming Helpers
 *
 * Single canonical streaming adapter for:
 * - OpenAI Responses API (streaming)
 * - OpenRouter Chat Completions (streaming + non-streaming)
 *
 * Keep this module Node-only. Do not import from V8 runtime files.
 */

import OpenAI from "openai";
import { createInstrumentedFetch } from "./fetch_instrumentation";
import { getOpenAIEnvironment } from "./openai";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type OpenAIResponsesStreamParams = Parameters<OpenAI["responses"]["stream"]>[0];

type ChatCompletionsStreamParams = Parameters<OpenAI["chat"]["completions"]["stream"]>[0];

type ChatCompletionsCreateParams = Parameters<OpenAI["chat"]["completions"]["create"]>[0];

type ChatCompletionsStream = ReturnType<OpenAI["chat"]["completions"]["stream"]>;

type ChatCompletionsFinal = Awaited<ReturnType<ChatCompletionsStream["finalChatCompletion"]>>;

let openRouterClient: OpenAI | null = null;

const getOpenRouterBaseUrl = (): string => {
  const base = process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL;
  return base.replace(/\/+$/, "");
};

const getOpenRouterApiKey = (): string => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for OpenRouter requests");
  }
  return apiKey;
};

const getOpenRouterClient = (): OpenAI => {
  if (openRouterClient) return openRouterClient;

  const debugLogging = process.env.LLM_DEBUG_FETCH === "1";
  openRouterClient = new OpenAI({
    apiKey: getOpenRouterApiKey(),
    baseURL: getOpenRouterBaseUrl(),
    fetch: createInstrumentedFetch(debugLogging),
  });

  return openRouterClient;
};

export const streamOpenAIResponses = (
  params: OpenAIResponsesStreamParams,
): ReturnType<OpenAI["responses"]["stream"]> => {
  const { client } = getOpenAIEnvironment();
  return client.responses.stream(params);
};

export const streamOpenRouterChatCompletion = (
  params: ChatCompletionsStreamParams,
): ChatCompletionsStream => {
  const client = getOpenRouterClient();
  return client.chat.completions.stream(params);
};

export const createOpenRouterChatCompletion = async (
  params: ChatCompletionsCreateParams,
): Promise<Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>> => {
  const client = getOpenRouterClient();
  return client.chat.completions.create(params);
};

export const collectOpenRouterChatCompletionText = async (
  params: ChatCompletionsStreamParams,
): Promise<{ text: string; completion: ChatCompletionsFinal }> => {
  const stream = streamOpenRouterChatCompletion(params);
  let text = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
    }
  }

  const completion = await stream.finalChatCompletion();
  return { text, completion };
};
