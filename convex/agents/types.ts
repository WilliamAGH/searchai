import type { Id } from "../_generated/dataModel";

/**
 * Shared context reference metadata that MUST remain in a "use node"-free module.
 *
 * Why: Convex will bundle anything imported from queries/mutations with the V8 runtime.
 * If this type (or helpers that consume it) lived in `orchestration_helpers.ts` we'd drag
 * the `node:crypto` dependency from those helpers into every V8 build and trigger
 * "Could not resolve \"node:crypto\"" again. Keep the shape here and only import it
 * from runtime-neutral code (validators, frontend, etc.). Node-only helpers should import
 * the type from this module instead of the other way around.
 */
export type ResearchContextReference = {
  contextId: string;
  type: "search_result" | "scraped_page" | "research_summary";
  url?: string;
  title?: string;
  timestamp: number;
  relevanceScore?: number;
  metadata?: unknown;
};

/**
 * Minimal payload persisted by the streaming workflow.
 * Defined here (rather than next to the signer) for the same reason as
 * `ResearchContextReference`: this file is intentionally Node-agnostic so it
 * can be imported from either runtime without pulling in `node:crypto`.
 */
export type StreamingPersistPayload = {
  assistantMessageId: Id<"messages">;
  workflowId: string;
  answer: string;
  sources: string[];
  contextReferences: ResearchContextReference[];
};
