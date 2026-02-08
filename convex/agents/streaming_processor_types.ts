import type { RunStreamEvent } from "@openai/agents";

// Re-export for consumers
export type { RunStreamEvent } from "@openai/agents";

/**
 * Minimal interface for streaming agent results.
 * Matches StreamedRunResult's AsyncIterable contract from @openai/agents.
 */
export interface AgentStreamResult extends AsyncIterable<RunStreamEvent> {
  // We only need the iterable interface for stream processing
}
