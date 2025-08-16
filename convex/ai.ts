"use node";
/**
 * AI generation pipeline - backwards compatibility re-exports
 * This file now only re-exports functions from the generation module.
 * All implementation has been moved to ./generation/pipeline.ts
 */

// Re-export generation functions from the generation module for backwards compatibility
"use node";
/**
 * AI generation pipeline - backwards compatibility re-exports
 * This file now only re-exports functions from the generation module.
 * All implementation has been moved to ./generation/pipeline.ts
 */

// Re-export generation functions from the generation module for backwards compatibility
export {
  generateStreamingResponse,
  generationStep,
  watchdogEnsureGeneration,
} from "./generation/pipeline";
