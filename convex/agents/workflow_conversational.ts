"use node";

import { run, MaxTurnsExceededError } from "@openai/agents";
import type { Id } from "../_generated/dataModel";
import { generateMessageId } from "../lib/id_generator";
import { AGENT_LIMITS, AGENT_TIMEOUTS } from "../lib/constants/cache";
import { stripTrailingSources } from "./answerParser";
import { createEmptyHarvestedData } from "../schemas/agents";
import { processAgentStream } from "./streaming_processor";
import type { AgentStreamResult } from "./streaming_processor_types";
import {
  logWorkflow,
  logWorkflowStart,
  logWorkflowComplete,
  logToolCall,
  logSourcesSummary,
} from "./workflow_logger";
import {
  buildConversationalCompleteEvent,
  buildMetadataEvent,
  createWorkflowEvent,
} from "./workflow_events";
import type { WorkflowStreamEvent } from "./workflow_event_types";
import {
  initializeWorkflowSession,
  withErrorContext,
  type StreamingWorkflowArgs,
} from "./orchestration_session";
import {
  buildWebResearchSourcesFromHarvested,
  withTimeout,
} from "./orchestration_helpers";
import { buildAgentInput } from "./input_builder";
import {
  updateChatTitleIfNeeded,
  persistAndCompleteWorkflow,
  type WorkflowActionCtx,
} from "./orchestration_persistence";
import {
  assertToolErrorThreshold,
  createWorkflowErrorHandler,
  handleMaxTurnsGracefully,
} from "./workflow_utils";

export async function* streamConversationalWorkflow(
  ctx: WorkflowActionCtx,
  args: StreamingWorkflowArgs,
): AsyncGenerator<WorkflowStreamEvent> {
  const { agents } = require("./definitions");

  const workflowId = generateMessageId();
  const startTime = Date.now();
  const nonce = generateMessageId();

  const writeEvent = (type: string, data: Record<string, unknown>) =>
    createWorkflowEvent(type, data);

  let workflowTokenId: Id<"workflowTokens"> | null = null;
  const handleError = createWorkflowErrorHandler({
    ctx,
    workflowId,
    getTokenId: () => workflowTokenId,
  });

  const harvested = createEmptyHarvestedData();

  try {
    const session = await initializeWorkflowSession(
      ctx,
      args,
      workflowId,
      nonce,
    );
    workflowTokenId = session.workflowTokenId;
    const { chat, conversationContext, imageUrls, imageAnalysis } = session;

    yield writeEvent("workflow_start", { workflowId, nonce });

    const agentInput = buildAgentInput({
      userQuery: args.userQuery,
      conversationContext,
      imageUrls,
      imageAnalysis,
    });

    logWorkflowStart("conversational", args.userQuery);

    yield writeEvent("progress", {
      stage: "thinking",
      message: "about your question...",
    });

    const selectedAgent =
      imageUrls.length > 0
        ? agents.conversationalVision
        : agents.conversational;

    const agentResult = await run(selectedAgent, agentInput, {
      stream: true,
      context: { actionCtx: ctx },
      maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
    });
    const streamResult: AgentStreamResult = agentResult;

    let accumulatedResponse = "";
    let toolCallCount = 0;
    let maxTurnsRecoveryUsed = false;
    let maxTurnsCaughtDuringStream = false;

    try {
      const processor = processAgentStream(
        streamResult,
        {
          callbacks: {
            onToolCall: (toolName, toolArgs) => {
              logToolCall(toolName, toolArgs);
              return null;
            },
            onToolError: (toolName, errorCount) => {
              logWorkflow(
                "TOOL_OUTPUT_SKIP",
                `Failed tool output: ${toolName}`,
              );
              assertToolErrorThreshold(errorCount, "Conversational workflow");
              return true;
            },
          },
          harvestData: true,
          maxToolErrors: AGENT_LIMITS.MAX_TOOL_ERRORS,
        },
        harvested,
      );

      while (true) {
        const { value, done } = await processor.next();
        if (done) {
          if (value && typeof value === "object" && "toolCallCount" in value) {
            toolCallCount = value.toolCallCount;
          }
          break;
        }
        const event = value;
        if (event.type === "reasoning") {
          yield writeEvent("reasoning", { content: event.content });
        } else if (event.type === "progress") {
          yield writeEvent("progress", {
            stage: event.stage,
            message: event.message,
            ...(event.toolContext?.reasoning && {
              toolReasoning: event.toolContext.reasoning,
            }),
            ...(event.toolContext?.query && {
              toolQuery: event.toolContext.query,
            }),
            ...(event.toolContext?.url && { toolUrl: event.toolContext.url }),
          });
        } else if (event.type === "content") {
          accumulatedResponse += event.delta;
          yield writeEvent("content", { delta: event.delta });
        }
      }
    } catch (streamError) {
      if (streamError instanceof MaxTurnsExceededError) {
        logWorkflow("MAX_TURNS_EXCEEDED", "Caught during stream iteration", {
          workflowId,
          toolCallCount,
          accumulatedLength: accumulatedResponse.length,
          harvestedSearchResults: harvested.searchResults.length,
          harvestedScrapedPages: harvested.scrapedContent.length,
        });
        maxTurnsCaughtDuringStream = true;

        const recovery = handleMaxTurnsGracefully(streamError, {
          workflowId,
          workflowType: "conversational",
          accumulatedContent: accumulatedResponse,
          toolCallCount,
          harvestedSearchResults: harvested.searchResults.length,
          harvestedScrapedPages: harvested.scrapedContent.length,
          maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
        });

        if (recovery.wasRecovered) {
          maxTurnsRecoveryUsed = true;
        } else {
          throw streamError;
        }
      } else {
        throw streamError;
      }
    }

    if (!maxTurnsCaughtDuringStream) {
      try {
        await withTimeout(
          agentResult.completed,
          AGENT_TIMEOUTS.AGENT_STAGE_MS * 2,
          "conversational",
        );
      } catch (completionError) {
        if (completionError instanceof MaxTurnsExceededError) {
          const recovery = handleMaxTurnsGracefully(completionError, {
            workflowId,
            workflowType: "conversational",
            accumulatedContent: accumulatedResponse,
            toolCallCount,
            harvestedSearchResults: harvested.searchResults.length,
            harvestedScrapedPages: harvested.scrapedContent.length,
            maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
          });

          if (recovery.wasRecovered) {
            maxTurnsRecoveryUsed = true;
          } else {
            throw completionError;
          }
        } else {
          throw completionError;
        }
      }
    }

    const rawFinalOutput = maxTurnsRecoveryUsed
      ? accumulatedResponse
      : typeof agentResult.finalOutput === "string"
        ? agentResult.finalOutput
        : accumulatedResponse;
    const finalOutput = stripTrailingSources(rawFinalOutput);
    const totalDuration = Date.now() - startTime;

    if (!finalOutput || finalOutput.trim().length === 0) {
      throw new Error(
        "Conversational agent produced empty output - no content to save",
      );
    }

    logWorkflowComplete({
      totalDurationMs: totalDuration,
      searchResultCount: harvested.searchResults.length,
      scrapedPageCount: harvested.scrapedContent.length,
      answerLength: finalOutput.length,
    });

    if (accumulatedResponse.length === 0 && finalOutput.length > 0) {
      yield writeEvent("content", { delta: finalOutput });
    }

    await updateChatTitleIfNeeded({
      ctx,
      chatId: args.chatId,
      currentTitle: chat.title,
      intent: args.userQuery,
    });

    const webResearchSources = buildWebResearchSourcesFromHarvested(harvested, {
      includeDebugSourceContext: args.includeDebugSourceContext === true,
    });

    const urlCount = webResearchSources.filter(
      (s) => typeof s.url === "string" && s.url.length > 0,
    ).length;
    logSourcesSummary(webResearchSources.length, urlCount);

    const { payload: persistedPayload, signature } = await withErrorContext(
      "Failed to persist and complete workflow",
      () =>
        persistAndCompleteWorkflow({
          ctx,
          chatId: args.chatId,
          content: finalOutput,
          workflowId,
          sessionId: args.sessionId,
          webResearchSources,
          workflowTokenId,
          nonce,
        }),
    );

    // Emit metadata before complete per SSE spec (complete is terminal for some clients)
    yield writeEvent(
      "metadata",
      buildMetadataEvent({
        workflowId,
        webResearchSources,
        hasLimitations: false,
        confidence: 1,
        answerLength: finalOutput.length,
        nonce,
      }),
    );

    yield writeEvent(
      "complete",
      buildConversationalCompleteEvent({
        workflowId,
        userQuery: args.userQuery,
        answer: finalOutput,
        startTime,
        webResearchSources,
        searchResultCount: harvested.searchResults.length,
        scrapedPageCount: harvested.scrapedContent.length,
      }),
    );

    yield writeEvent("persisted", {
      payload: persistedPayload,
      nonce,
      signature,
    });
  } catch (error) {
    await handleError(
      error instanceof Error
        ? error
        : new Error(`Conversational workflow failed: ${String(error)}`, {
            cause: error,
          }),
      "conversational",
    );
  }
}
