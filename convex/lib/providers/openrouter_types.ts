/**
 * OpenRouter message format
 * Kept for compatibility with existing OpenRouter request/response shapes.
 */
export interface OpenRouterMessage {
  role: string;
  content: string;
  cache_control?: { type: string };
}

/**
 * OpenRouter request body
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
