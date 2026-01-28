import type { AgentStreamEvent } from "./streaming_event_types";

// Re-export for consumers
export type { AgentStreamEvent } from "./streaming_event_types";

/**
 * Minimal interface for streaming agent results.
 * Matches StreamedRunResult's AsyncIterable interface without requiring
 * the full generic type parameters.
 */
export interface AgentStreamResult extends AsyncIterable<AgentStreamEvent> {
  // We only need the iterable interface for stream processing
}
