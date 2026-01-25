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
