"use node";

import { ensureCustomEventPolyfill } from "./workflow_utils";

// Ensure polyfill is loaded
ensureCustomEventPolyfill();

// Re-export workflows
export { streamConversationalWorkflow } from "./workflow_conversational";
export { streamResearchWorkflow } from "./workflow_research";

// Re-export types
export type { StreamingWorkflowArgs } from "./orchestration_session";
export type { WebResearchSource } from "../lib/validators";
