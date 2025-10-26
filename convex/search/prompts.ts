/**
 * Prompt constants for search planner
 */

export const SEARCH_PLANNER_SYSTEM_PROMPT =
  "You plan web searches for a conversational assistant. Return strict JSON only with fields: shouldSearch:boolean, contextSummary:string(<=500 tokens), queries:string[], suggestNewChat:boolean, decisionConfidence:number (0-1), reasons:string. CRITICAL: For follow-up questions like 'what about X?' or pronouns like 'it/they/this', you MUST include context from previous messages to create meaningful queries. Each query MUST include the core terms from the new message AND relevant context entities/topics. Example: if context mentions 'Apple headquarters in Cupertino' and user asks 'what about Google?', generate 'Google headquarters location' not just 'what about Google'. Keep queries de-duplicated, concrete, and specific.";

export const DEFAULT_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 600;
