"use node";
import {
  logWorkflow,
  logContextPipeline,
  logWorkflowComplete,
} from "./workflow_logger";
import { executeParallelResearch } from "./parallel_research";
import { executeSynthesis } from "./synthesis_executor";
import { RELEVANCE_SCORES, CONTENT_LIMITS } from "../lib/constants/cache";
import {
  convertToContextReferences,
  buildSearchResultsFromContextRefs,
} from "./orchestration_helpers";
import {
  buildCompleteEvent,
  buildMetadataEvent,
  createWorkflowEvent,
} from "./workflow_events";
import type {
  WorkflowStreamEvent,
  WorkflowPathArgs,
} from "./workflow_event_types";
import {
  updateChatTitleIfNeeded,
  persistAssistantMessage,
  completeWorkflowWithSignature,
} from "./orchestration_persistence";
import { generateMessageId } from "../lib/id_generator";
import type {
  ResearchOutput,
  StreamingPersistPayload,
} from "../schemas/agents";
import {
  mapAsyncGenerator,
  mapSynthesisEvent,
  mapResearchEvent,
} from "./workflow_utils";

export async function* executeParallelPath({
  ctx,
  args,
  workflowId,
  nonce,
  workflowTokenId,
  chat,
  startTime,
  planningOutput,
}: WorkflowPathArgs): AsyncGenerator<WorkflowStreamEvent> {
  // Dynamic require to avoid circular import with definitions.ts
  const { agents } = require("./definitions");
  const writeEvent = (type: string, data: Record<string, unknown>) =>
    createWorkflowEvent(type, data);
  const parallelResearchGenerator = executeParallelResearch({
    ctx,
    searchQueries: planningOutput.searchQueries,
  });

  // Use mapAsyncGenerator to consume and capture the return value
  const parallelResearchReturn = yield* mapAsyncGenerator(
    parallelResearchGenerator,
    (event) => mapResearchEvent(event, writeEvent),
  );
  const { harvested, stats: parallelStats } = parallelResearchReturn;
  logWorkflow(
    "PARALLEL_EXECUTION_COMPLETE",
    `Total: ${parallelStats.totalDurationMs}ms`,
  );
  const syntheticKeyFindings = harvested.scrapedContent
    .filter(
      (scraped) =>
        scraped.summary &&
        scraped.summary.length > CONTENT_LIMITS.MIN_SUMMARY_LENGTH,
    )
    .slice(0, 5)
    .map((scraped) => ({
      finding:
        scraped.summary.length > CONTENT_LIMITS.LOG_DISPLAY_LENGTH + 3
          ? scraped.summary.substring(0, CONTENT_LIMITS.LOG_DISPLAY_LENGTH) +
            "..."
          : scraped.summary,
      sources: [scraped.url],
      confidence: ((scraped.relevanceScore ?? 0) >=
      RELEVANCE_SCORES.HIGH_THRESHOLD
        ? "high"
        : (scraped.relevanceScore ?? 0) >= RELEVANCE_SCORES.MEDIUM_THRESHOLD
          ? "medium"
          : "low") as "high" | "medium" | "low",
    }));
  const researchOutput: ResearchOutput = {
    researchSummary:
      harvested.searchResults.length > 0
        ? `Found ${harvested.searchResults.length} search results and scraped ${harvested.scrapedContent.length} pages.`
        : "No search results found.",
    keyFindings: syntheticKeyFindings,
    sourcesUsed: [],
    scrapedContent: harvested.scrapedContent.map((sc) => ({
      url: sc.url,
      title: sc.title,
      content: sc.content,
      summary: sc.summary,
      contentLength: sc.contentLength,
      scrapedAt: sc.scrapedAt,
      contextId: sc.contextId,
      relevanceScore: sc.relevanceScore,
    })),
    serpEnrichment:
      Object.keys(harvested.serpEnrichment).length > 0
        ? harvested.serpEnrichment
        : null,
    researchQuality:
      harvested.scrapedContent.length >= 2
        ? "comprehensive"
        : harvested.scrapedContent.length >= 1
          ? "adequate"
          : "limited",
  };
  const scrapedUrlMap = new Map(
    harvested.scrapedContent.map((s) => [s.url, s]),
  );
  const sources: ResearchOutput["sourcesUsed"] = harvested.searchResults.map(
    (r) => {
      const scraped = scrapedUrlMap.get(r.url);
      return {
        url: r.url,
        title: r.title,
        contextId: scraped ? scraped.contextId : generateMessageId(),
        type: scraped ? "scraped_page" : "search_result",
        relevance: r.relevanceScore > 0.7 ? "high" : "medium",
      };
    },
  );
  researchOutput.sourcesUsed = Array.from(
    new Map(sources.map((s) => [s.url, s])).values(),
  );
  yield writeEvent("progress", {
    stage: "analyzing",
    message: `Analyzing findings from ${researchOutput.sourcesUsed?.length || 0} sources...`,
    sourcesUsed: researchOutput.sourcesUsed?.length || 0,
  });
  yield writeEvent("progress", {
    stage: "generating",
    message: "Writing comprehensive answer...",
  });
  const mergedScrapedContent =
    researchOutput.scrapedContent && researchOutput.scrapedContent.length > 0
      ? researchOutput.scrapedContent
      : harvested.scrapedContent;

  const hasAgentEnrichment =
    researchOutput.serpEnrichment &&
    Object.keys(researchOutput.serpEnrichment).length > 0;
  const hasHarvestedEnrichment =
    Object.keys(harvested.serpEnrichment).length > 0;
  const mergedSerpEnrichment = hasAgentEnrichment
    ? (researchOutput.serpEnrichment ?? undefined)
    : hasHarvestedEnrichment
      ? harvested.serpEnrichment
      : undefined;

  logContextPipeline({
    agentScrapedCount: researchOutput.scrapedContent?.length || 0,
    harvestedScrapedCount: harvested.scrapedContent.length,
    mergedScrapedCount: mergedScrapedContent.length,
    agentEnrichmentKeys: Object.keys(researchOutput.serpEnrichment || {}),
    harvestedEnrichmentKeys: Object.keys(harvested.serpEnrichment),
    usingHarvestedScraped:
      mergedScrapedContent === harvested.scrapedContent &&
      harvested.scrapedContent.length > 0,
    usingHarvestedEnrichment:
      mergedSerpEnrichment === harvested.serpEnrichment &&
      hasHarvestedEnrichment,
    hasKnowledgeGraph: !!mergedSerpEnrichment?.knowledgeGraph,
    hasAnswerBox: !!mergedSerpEnrichment?.answerBox,
  });

  const synthesisGenerator = executeSynthesis({
    ctx,
    synthesisAgent: agents.answerSynthesis,
    userQuery: args.userQuery,
    userIntent: planningOutput.userIntent,
    researchSummary: researchOutput.researchSummary,
    keyFindings: researchOutput.keyFindings,
    sourcesUsed: (researchOutput.sourcesUsed || []).map((s) => ({
      url: s.url ?? "",
      title: s.title ?? "",
      type: s.type,
      relevance: s.relevance ?? "medium",
    })),
    informationGaps: researchOutput.informationGaps ?? undefined,
    scrapedContent: mergedScrapedContent,
    serpEnrichment: mergedSerpEnrichment,
  });

  // Use mapAsyncGenerator to consume and capture the return value
  const synthResult = yield* mapAsyncGenerator(synthesisGenerator, (event) =>
    mapSynthesisEvent(event, writeEvent),
  );
  const finalAnswerText = synthResult.answer;
  const parsedAnswer = synthResult.parsedAnswer;

  if (
    !planningOutput ||
    typeof planningOutput !== "object" ||
    Object.keys(planningOutput).length === 0
  ) {
    throw new Error("Planning output is empty or invalid");
  }
  if (
    !researchOutput ||
    typeof researchOutput !== "object" ||
    Object.keys(researchOutput).length === 0
  ) {
    throw new Error("Research output is empty or invalid");
  }
  if (
    !parsedAnswer ||
    typeof parsedAnswer !== "object" ||
    Object.keys(parsedAnswer).length === 0
  ) {
    throw new Error("Parsed answer is empty or invalid");
  }

  const normalizedSources = (researchOutput.sourcesUsed || []).map((s) => {
    const relevance: "high" | "medium" | "low" =
      s.relevance === "high" || s.relevance === "low" ? s.relevance : "medium";
    return {
      url: s.url ?? "",
      title: s.title ?? "",
      contextId: s.contextId,
      type: s.type,
      relevance,
    };
  });
  const contextReferences = convertToContextReferences(normalizedSources);

  // Emit metadata before complete per SSE spec (complete is terminal for some clients)
  yield writeEvent(
    "metadata",
    buildMetadataEvent({
      workflowId,
      contextReferences,
      hasLimitations: parsedAnswer.hasLimitations,
      confidence: parsedAnswer.confidence,
      answerLength: finalAnswerText.length,
      nonce,
    }),
  );

  yield writeEvent(
    "complete",
    buildCompleteEvent({
      workflowId,
      userQuery: args.userQuery,
      answer: finalAnswerText,
      startTime,
      planning: {
        ...planningOutput,
        anticipatedChallenges:
          planningOutput.anticipatedChallenges ?? undefined,
      },
      research: {
        ...researchOutput,
        sourcesUsed: normalizedSources,
        informationGaps: researchOutput.informationGaps ?? undefined,
      },
      hasLimitations: parsedAnswer.hasLimitations,
      confidence: parsedAnswer.confidence,
      answerCompleteness: parsedAnswer.answerCompleteness,
      sourcesUsed: parsedAnswer.sourcesUsed,
    }),
  );

  await updateChatTitleIfNeeded({
    ctx,
    chatId: args.chatId,
    currentTitle: chat.title,
    intent: planningOutput?.userIntent || args.userQuery,
  });

  const searchResults = buildSearchResultsFromContextRefs(contextReferences);

  const assistantMessageId = await persistAssistantMessage({
    ctx,
    chatId: args.chatId,
    content: finalAnswerText,
    workflowId,
    sessionId: args.sessionId,
    searchResults,
    sources: parsedAnswer.sourcesUsed || [],
    contextReferences,
  });
  const persistedPayload: StreamingPersistPayload = {
    assistantMessageId,
    workflowId,
    answer: finalAnswerText,
    sources: parsedAnswer.sourcesUsed || [],
    contextReferences,
  };
  const signature = await completeWorkflowWithSignature({
    ctx,
    workflowTokenId,
    payload: persistedPayload,
    nonce,
  });

  logWorkflowComplete({
    totalDurationMs: Date.now() - startTime,
    searchResultCount: harvested.searchResults.length,
    scrapedPageCount: harvested.scrapedContent.length,
    answerLength: finalAnswerText.length,
  });

  yield writeEvent("persisted", {
    payload: persistedPayload,
    nonce,
    signature,
  });
}
