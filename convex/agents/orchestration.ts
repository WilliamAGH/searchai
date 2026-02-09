"use node";

import { ensureCustomEventPolyfill } from "./workflow_utils";

const polyfillImpl = ensureCustomEventPolyfill();
console.info(`[polyfill] CustomEvent implementation: ${polyfillImpl}`);

// Re-export workflows
export { streamConversationalWorkflow } from "./workflow_conversational";

// Re-export types
export type { StreamingWorkflowArgs } from "./orchestration_session";
export type { WebResearchSource } from "../lib/validators";
