"use node";

import { run } from "@openai/agents";
import type { Id } from "../_generated/dataModel";
import { generateMessageId } from "../lib/id_generator";
import { AGENT_LIMITS, AGENT_TIMEOUTS, CONFIDENCE_THRESHOLDS } from "../lib/constants/cache";
import { logWorkflowError, logPlanningComplete } from "./workflow_logger";
import { createWorkflowEvent } from "./workflow_events";
import type { WorkflowStreamEvent } from "./workflow_event_types";
import { initializeWorkflowSession, type StreamingWorkflowArgs } from "./orchestration_session";
import {
  detectInstantResponse,
  detectErrorStage,
  buildPlanningInput,
  withTimeout,
} from "./orchestration_helpers";
import { safeParsePlanningOutput } from "../schemas/agents";
import { createWorkflowErrorHandler } from "./workflow_utils";
import { executeInstantPath } from "./workflow_instant";
import { executeFastPath } from "./workflow_fast_path";
import { executeParallelPath } from "./workflow_parallel_path";
import type { WorkflowActionCtx } from "./orchestration_persistence";

export async function* streamResearchWorkflow(
  ctx: WorkflowActionCtx,
  args: StreamingWorkflowArgs,
): AsyncGenerator<WorkflowStreamEvent> {
  // Dynamic require to avoid circular import with definitions.ts
  const { agents } = require("./definitions");

  const workflowId = generateMessageId();
  const startTime = Date.now();
  const nonce = generateMessageId();

  const writeEvent = (type: string, data: Record<string, unknown>) =>
    createWorkflowEvent(type, data);

  let workflowTokenId: Id<"workflowTokens"> | null = null;
  let instantResponse: string | null = null;

  const handleError = createWorkflowErrorHandler({
    ctx,
    workflowId,
    getTokenId: () => workflowTokenId,
  });

  try {
    const session = await initializeWorkflowSession(ctx, args, workflowId, nonce);
    workflowTokenId = session.workflowTokenId;
    const { chat, conversationContext: conversationSource } = session;

    instantResponse = detectInstantResponse(args.userQuery);

    if (instantResponse) {
      const instantGenerator = executeInstantPath({
        ctx,
        args,
        workflowId,
        nonce,
        workflowTokenId,
        chat,
        instantResponse,
        startTime,
      });
      for await (const event of instantGenerator) {
        yield event;
      }
      return;
    }

    yield writeEvent("progress", {
      stage: "planning",
      message: "research strategy for your question...",
    });

    const planningStart = Date.now();
    const planningInput = buildPlanningInput(args.userQuery, conversationSource);
    const planningResult = await run(agents.queryPlanner, planningInput, {
      stream: true,
      context: { actionCtx: ctx },
      maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
    });

    for await (const event of planningResult) {
      if (event.type === "run_item_stream_event" && event.name === "reasoning_item_created") {
        const item = event.item as { content?: string; text?: string };
        yield writeEvent("reasoning", {
          content: item.content || item.text || "",
        });
      }
    }

    await withTimeout(planningResult.completed, AGENT_TIMEOUTS.AGENT_STAGE_MS, "planning");
    const planningDuration = Date.now() - planningStart;

    if (planningResult.error) {
      logWorkflowError("PLANNING_ERROR", "Planning agent error", planningResult.error);
      const errorMsg =
        planningResult.error instanceof Error
          ? planningResult.error.message
          : String(planningResult.error);
      throw new Error(`Planning agent failed: ${errorMsg}`);
    }

    const planningOutput = safeParsePlanningOutput(planningResult.finalOutput, workflowId);

    if (!planningOutput) {
      logWorkflowError("PLANNING_ERROR", "Failed to validate planning output", {
        hasError: !!planningResult.error,
        lastAgent: planningResult.lastAgent?.name,
        itemsGenerated: planningResult.newItems?.length || 0,
        finalOutputKeys: planningResult.finalOutput ? Object.keys(planningResult.finalOutput) : [],
      });
      throw new Error(
        "Planning failed: output validation failed. Check OpenAI API key and model availability.",
      );
    }

    logPlanningComplete(planningDuration, planningOutput.searchQueries.length);

    const searchQueriesCount = planningOutput.searchQueries.length;
    const informationNeededCount = planningOutput.informationNeeded?.length || 0;
    const needsResearch =
      searchQueriesCount > 0 || informationNeededCount > 0 || planningOutput.needsWebScraping;

    if (!needsResearch && planningOutput.confidenceLevel >= CONFIDENCE_THRESHOLDS.SKIP_RESEARCH) {
      const fastPathGenerator = executeFastPath({
        ctx,
        args,
        workflowId,
        nonce,
        workflowTokenId,
        chat,
        startTime,
        planningOutput,
      });
      for await (const event of fastPathGenerator) {
        yield event;
      }
      return;
    }

    const parallelPathGenerator = executeParallelPath({
      ctx,
      args,
      workflowId,
      nonce,
      workflowTokenId,
      chat,
      startTime,
      planningOutput,
    });
    for await (const event of parallelPathGenerator) {
      yield event;
    }
  } catch (error) {
    const stage = detectErrorStage(error, instantResponse);
    await handleError(
      error instanceof Error ? error : new Error("An unknown error occurred"),
      stage,
    );
  }
}
