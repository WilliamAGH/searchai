import type { StreamingEvent } from "./streaming_event_types";

// Re-export for consumers
export type { StreamingEvent } from "./streaming_event_types";

/**
 * Minimal interface for streaming agent results.
 * Matches StreamedRunResult's AsyncIterable interface without requiring
 * the full generic type parameters.
 */
export interface AgentStreamResult extends AsyncIterable<StreamingEvent> {
  // We only need the iterable interface for stream processing
}
