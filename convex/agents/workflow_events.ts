"use node";

/**
 * Workflow SSE Event Builders
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Consolidates duplicated SSE event construction into reusable builders.
 *
 * These event types match the frontend's expected SSE payload structure.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 * @see {@link ../../src/hooks/useSSEStream.ts} - frontend event consumer
 */

import { relevanceScoreToLabel } from "./orchestration_helpers";
import type {
  BuildCompleteEventParams,
  BuildMetadataEventParams,
  BuildPersistedEventParams,
  PlanningEventPayload,
  ResearchEventPayload,
  AnswerEventPayload,
  WorkflowCompletePayload,
  WorkflowMetadataPayload,
  WorkflowPersistedPayload,
  WorkflowStreamEvent,
} from "./workflow_event_types";

// ============================================
// Core Event Utilities
// ============================================

/**
 * Create a cleaned SSE event object, filtering out undefined/null/empty values.
 * Convex cannot serialize empty objects {}, so we strip them.
 *
 * @param type - Event type name
 * @param data - Event payload data
 * @returns Cleaned event object safe for Convex serialization
 */
export function createWorkflowEvent(
  type: string,
  data: Record<string, unknown>,
): WorkflowStreamEvent {
  const cleaned: Record<string, unknown> = { type };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    cleaned[k] = v;
  }
  return cleaned;
}

// ============================================
// Event Builders
// ============================================

/**
 * Build a complete event payload with sensible defaults.
 *
 * This centralizes the construction of the "complete" SSE event,
 * which was previously duplicated in 4 locations in orchestration.ts.
 */
export function buildCompleteEvent(params: BuildCompleteEventParams): WorkflowCompletePayload {
  const {
    workflowId,
    userQuery,
    answer,
    startTime,
    planning,
    research,
    hasLimitations = false,
    limitations,
    sourcesUsed = [],
    confidence = 1,
    answerCompleteness = "complete",
    contextReferences = [],
    planningDuration,
    researchDuration,
    synthesisDuration,
  } = params;

  const totalDuration = Date.now() - startTime;

  const planningPayload: PlanningEventPayload = {
    userIntent: planning?.userIntent ?? userQuery,
    informationNeeded: planning?.informationNeeded ?? [],
    searchQueries: planning?.searchQueries ?? [],
    needsWebScraping: planning?.needsWebScraping ?? false,
    anticipatedChallenges: planning?.anticipatedChallenges,
    confidenceLevel: planning?.confidenceLevel ?? 1,
  };

  const derivedSourcesUsed =
    research?.sourcesUsed ??
    contextReferences
      .filter((ref) => ref.type === "search_result" || ref.type === "scraped_page")
      .map((ref) => ({
        url: ref.url ?? "",
        title: ref.title ?? "",
        contextId: ref.contextId,
        type: ref.type,
        relevance: relevanceScoreToLabel(ref.relevanceScore),
      }));

  const researchPayload: ResearchEventPayload = {
    researchSummary: research?.researchSummary ?? "",
    keyFindings: research?.keyFindings ?? [],
    sourcesUsed: derivedSourcesUsed,
    informationGaps: research?.informationGaps,
    researchQuality: research?.researchQuality ?? "adequate",
  };

  const answerPayload: AnswerEventPayload = {
    answer,
    hasLimitations,
    limitations,
    sourcesUsed,
    answerCompleteness,
    confidence,
  };

  const metadata: WorkflowCompletePayload["workflow"]["metadata"] = {
    totalDuration,
    timestamp: Date.now(),
  };

  if (planningDuration !== undefined) {
    metadata.planningDuration = planningDuration;
  }
  if (researchDuration !== undefined) {
    metadata.researchDuration = researchDuration;
  }
  if (synthesisDuration !== undefined) {
    metadata.synthesisDuration = synthesisDuration;
  }

  return {
    workflow: {
      workflowId,
      planning: planningPayload,
      research: researchPayload,
      answer: answerPayload,
      metadata,
    },
  };
}

/**
 * Build a metadata event payload.
 */
export function buildMetadataEvent(params: BuildMetadataEventParams): WorkflowMetadataPayload {
  return {
    metadata: {
      workflowId: params.workflowId,
      contextReferences: params.contextReferences,
      hasLimitations: params.hasLimitations,
      confidence: params.confidence,
      answerLength: params.answerLength,
    },
    nonce: params.nonce,
  };
}

/**
 * Build a persisted event payload.
 */
export function buildPersistedEvent(params: BuildPersistedEventParams): WorkflowPersistedPayload {
  return {
    payload: params.payload,
    nonce: params.nonce,
    signature: params.signature,
  };
}

// ============================================
// Convenience Builders for Common Cases
// ============================================

/**
 * Build a complete event for instant responses (no research).
 */
export function buildInstantCompleteEvent(params: {
  workflowId: string;
  userQuery: string;
  answer: string;
  startTime: number;
}): WorkflowCompletePayload {
  return buildCompleteEvent({
    ...params,
    planning: {
      userIntent: "Simple conversational message - no research needed",
      searchQueries: [],
      needsWebScraping: false,
      confidenceLevel: 1,
    },
    research: {
      researchSummary: "No research required.",
      keyFindings: [],
      sourcesUsed: [],
      researchQuality: "adequate",
    },
    confidence: 1,
    answerCompleteness: "complete",
  });
}

/**
 * Build a complete event for conversational workflow.
 * Includes harvested sources in the research output.
 */
export function buildConversationalCompleteEvent(params: {
  workflowId: string;
  userQuery: string;
  answer: string;
  startTime: number;
  contextReferences: BuildCompleteEventParams["contextReferences"];
  searchResultCount: number;
  scrapedPageCount: number;
}): WorkflowCompletePayload {
  const researchSummary =
    params.searchResultCount > 0
      ? `Found ${params.searchResultCount} search results and scraped ${params.scrapedPageCount} pages.`
      : "";

  return buildCompleteEvent({
    workflowId: params.workflowId,
    userQuery: params.userQuery,
    answer: params.answer,
    startTime: params.startTime,
    planning: {
      userIntent: params.userQuery,
      searchQueries: [],
    },
    research: {
      researchSummary,
      keyFindings: [],
      researchQuality:
        params.scrapedPageCount >= 2
          ? "comprehensive"
          : params.scrapedPageCount >= 1
            ? "adequate"
            : "limited",
    },
    contextReferences: params.contextReferences ?? [],
    confidence: 1,
  });
}
