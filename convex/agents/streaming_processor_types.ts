import type { StreamingEventItem } from "./streaming_event_types";

/**
 * Stream event from OpenAI Agents SDK.
 * Matches the subset of RunStreamEvent that we process.
 */
export interface AgentStreamEvent {
  type: string;
  name?: string;
  item?: StreamingEventItem;
}

/**
 * Minimal interface for streaming agent results.
 * Matches StreamedRunResult's AsyncIterable interface without requiring
 * the full generic type parameters.
 */
export interface AgentStreamResult extends AsyncIterable<AgentStreamEvent> {
  // We only need the iterable interface for stream processing
}
