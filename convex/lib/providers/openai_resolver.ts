"use node";

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface ResolveOpenAIEndpointOptions {
  defaultBaseURL?: string;
  prioritizeOpenRouterBaseURL?: boolean;
}

export interface ResolvedOpenAIEndpoint {
  baseURL?: string;
  normalizedBaseURL?: string;
  isOpenRouter: boolean;
  isOpenAIEndpoint: boolean;
  isChatCompletionsEndpoint: boolean;
}

/**
 * Resolve provider base URL from environment in one canonical place.
 */
export const resolveOpenAIEndpoint = (
  options?: ResolveOpenAIEndpointOptions,
): ResolvedOpenAIEndpoint => {
  const baseURL = options?.prioritizeOpenRouterBaseURL
    ? process.env.LLM_BASE_URL ||
      process.env.OPENROUTER_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      options.defaultBaseURL
    : process.env.LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      process.env.OPENROUTER_BASE_URL ||
      options?.defaultBaseURL;

  const normalizedBaseURL = baseURL?.toLowerCase();
  const isOpenRouter = normalizedBaseURL?.includes("openrouter") ?? false;
  const isOpenAIEndpoint = normalizedBaseURL
    ? normalizedBaseURL.includes("api.openai.com")
    : true;
  const isChatCompletionsEndpoint =
    normalizedBaseURL?.includes("/chat/completions") ?? false;

  return {
    baseURL,
    normalizedBaseURL,
    isOpenRouter,
    isOpenAIEndpoint,
    isChatCompletionsEndpoint,
  };
};

/**
 * Resolve API key with endpoint-aware precedence.
 */
export const resolveOpenAIApiKey = (
  endpoint: ResolvedOpenAIEndpoint,
  options?: { preferOpenRouter?: boolean },
): string | undefined => {
  const preferOpenRouter = options?.preferOpenRouter ?? endpoint.isOpenRouter;
  if (process.env.LLM_API_KEY) {
    return process.env.LLM_API_KEY;
  }
  if (preferOpenRouter) {
    return process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  }
  return process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
};

/**
 * Resolve OpenRouter-compatible client configuration.
 */
export const resolveOpenRouterClientConfig = (): {
  baseURL: string;
  apiKey: string;
} | null => {
  const endpoint = resolveOpenAIEndpoint({
    defaultBaseURL: DEFAULT_OPENROUTER_BASE_URL,
    prioritizeOpenRouterBaseURL: true,
  });
  const apiKey = resolveOpenAIApiKey(endpoint, { preferOpenRouter: true });
  if (!apiKey) {
    return null;
  }

  const baseURL = (endpoint.baseURL || DEFAULT_OPENROUTER_BASE_URL).replace(
    /\/+$/,
    "",
  );
  return { baseURL, apiKey };
};
