import type {
  ResearchContextReference,
  StreamingPersistPayload,
  PlanningOutput,
} from "../schemas/agents";
import type { Id } from "../_generated/dataModel";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import type { StreamingWorkflowArgs } from "./orchestration_session";

/**
 * Shared args for workflow path executors (fast path, parallel path).
 * Extracted to avoid duplication per [CC1b].
 */
export interface WorkflowPathArgs {
  ctx: WorkflowActionCtx;
  args: StreamingWorkflowArgs;
  workflowId: string;
  nonce: string;
  workflowTokenId: Id<"workflowTokens"> | null;
  chat: { title?: string };
  startTime: number;
  planningOutput: PlanningOutput;
}

/**
 * Planning output for complete event.
 * Subset of QueryPlannerOutput that synthesis needs.
 */
export interface PlanningEventPayload {
  userIntent: string;
  informationNeeded?: string[];
  searchQueries: Array<{
    query: string;
    reasoning: string;
    priority: number;
  }>;
  needsWebScraping?: boolean;
  anticipatedChallenges?: string[];
  confidenceLevel?: number;
}

/**
 * Research output for complete event.
 */
export interface ResearchEventPayload {
  researchSummary: string;
  keyFindings: Array<{
    finding: string;
    sources: string[];
    confidence: string;
  }>;
  sourcesUsed: Array<{
    url: string;
    title: string;
    contextId: string;
    type: "search_result" | "scraped_page" | "research_summary";
    relevance: "high" | "medium" | "low";
  }>;
  informationGaps?: string[];
  researchQuality?: "comprehensive" | "adequate" | "limited";
}

/**
 * Answer output for complete event.
 */
export interface AnswerEventPayload {
  answer: string;
  hasLimitations?: boolean;
  limitations?: string;
  sourcesUsed?: string[];
  answerCompleteness?: "complete" | "partial" | "insufficient";
  confidence: number;
}

/**
 * Workflow complete event payload.
 * Sent when a workflow finishes successfully.
 */
export interface WorkflowCompletePayload {
  workflow: {
    workflowId: string;
    planning: PlanningEventPayload;
    research: ResearchEventPayload;
    answer: AnswerEventPayload;
    metadata: {
      totalDuration: number;
      planningDuration?: number;
      researchDuration?: number;
      synthesisDuration?: number;
      timestamp: number;
    };
  };
  [key: string]: unknown;
}

/**
 * Workflow metadata event payload.
 * Sent with additional context for the frontend.
 */
export interface WorkflowMetadataPayload {
  metadata: {
    workflowId: string;
    contextReferences: ResearchContextReference[];
    hasLimitations: boolean;
    confidence: number;
    answerLength: number;
  };
  nonce: string;
  [key: string]: unknown;
}

/**
 * Workflow persisted event payload.
 * Sent after data is saved to the database.
 */
export interface WorkflowPersistedPayload {
  payload: StreamingPersistPayload;
  nonce: string;
  signature: string;
}

/**
 * Type for workflow stream events.
 * All events are Record<string, unknown> for Convex serialization.
 */
export type WorkflowStreamEvent = Record<string, unknown>;

/**
 * Parameters for building a complete event.
 */
export interface BuildCompleteEventParams {
  workflowId: string;
  userQuery: string;
  answer: string;
  startTime: number;

  /** Optional planning output (defaults to minimal placeholder) */
  planning?: Partial<PlanningEventPayload>;

  /** Optional research output (defaults to minimal placeholder) */
  research?: Partial<ResearchEventPayload>;

  /** Answer metadata */
  hasLimitations?: boolean;
  limitations?: string;
  sourcesUsed?: string[];
  confidence?: number;
  answerCompleteness?: "complete" | "partial" | "insufficient";

  /** Context references for building sourcesUsed */
  contextReferences?: ResearchContextReference[];

  /** Duration metrics */
  planningDuration?: number;
  researchDuration?: number;
  synthesisDuration?: number;
}

/**
 * Parameters for building a metadata event.
 */
export interface BuildMetadataEventParams {
  workflowId: string;
  contextReferences: ResearchContextReference[];
  hasLimitations: boolean;
  confidence: number;
  answerLength: number;
  nonce: string;
}

/**
 * Parameters for building a persisted event.
 */
export interface BuildPersistedEventParams {
  payload: StreamingPersistPayload;
  nonce: string;
  signature: string;
}
