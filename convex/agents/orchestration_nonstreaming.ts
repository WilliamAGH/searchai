"use node";

/**
 * Non-streaming Research Workflow
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Contains the synchronous (non-streaming) orchestrateResearchWorkflow action.
 *
 * @see {@link ./orchestration.ts} - streaming workflows
 */

import { action } from "../_generated/server";
import { run, RunToolCallItem, RunToolCallOutputItem } from "@openai/agents";
import { generateMessageId } from "../lib/id_generator";
import { parseAnswerText, stripTrailingSources } from "./answerParser";
import { AGENT_TIMEOUTS, AGENT_LIMITS } from "../lib/constants/cache";
import {
  buildPlanningInput,
  buildResearchInstructions,
  buildSynthesisInstructions,
  formatContextReferencesForPrompt,
  buildConversationBlock,
  processToolCalls,
  buildToolCallLog,
  buildUrlContextMap,
  normalizeSourceContextIds,
  withTimeout,
} from "./orchestration_helpers";
import {
  safeParseResearchOutput,
  type ResearchOutput,
} from "../schemas/agents";
import { applyEnhancements } from "../enhancements";
import { logWorkflow } from "./workflow_logger";
import { assertToolErrorThreshold } from "./workflow_utils";
import {
  orchestrateResearchWorkflowArgs,
  orchestrateResearchWorkflowReturns,
} from "./orchestration_nonstreaming_schema";

// ============================================
// Types
// ============================================

interface ToolCallLogEntry {
  toolName: string;
  timestamp: number;
  reasoning: string;
  input: unknown;
  resultSummary: string;
  durationMs: number;
  success: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolErrorOutput(output: unknown): boolean {
  return isRecord(output) && "error" in output && Boolean(output.error);
}

// ============================================
// Non-streaming Workflow Action
// ============================================

/**
 * Non-streaming research workflow action.
 * Executes planning → research → synthesis pipeline synchronously.
 *
 * Use this for programmatic/API access where streaming is not needed.
 * For streaming workflows, use streamResearchWorkflow or streamConversationalWorkflow.
 */
export const orchestrateResearchWorkflow = action({
  args: orchestrateResearchWorkflowArgs,
  returns: orchestrateResearchWorkflowReturns,
  // @ts-ignore TS2589 - Convex type instantiation is excessively deep with complex return validators
  handler: async (ctx, args) => {
    // Dynamic require to avoid circular import with definitions.ts
    const { agents } = require("./definitions");
    const workflowId = generateMessageId();
    const startTime = Date.now();

    const planningInput = buildPlanningInput(
      args.userQuery,
      args.conversationContext,
    );
    const planningStart = Date.now();
    const planningResult = await withTimeout(
      run(agents.queryPlanner, planningInput, {
        context: { actionCtx: ctx },
        maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
      }),
      AGENT_TIMEOUTS.AGENT_STAGE_MS,
      "planning",
    );
    const planningDuration = Date.now() - planningStart;
    if (!planningResult.finalOutput)
      throw new Error("Planning failed: no final output");

    const plannedQueries = planningResult.finalOutput.searchQueries ?? [];
    const hasPlannedQueries = plannedQueries.length > 0;
    const conversationBlock = buildConversationBlock(args.conversationContext);
    const referenceBlock = formatContextReferencesForPrompt(
      args.contextReferences ?? [],
    );

    // Research
    const researchStart = Date.now();
    let researchDuration = 0;
    let researchOutput: ResearchOutput;
    let toolCallLog: ToolCallLogEntry[] = [];

    if (!hasPlannedQueries) {
      researchDuration = Date.now() - researchStart;
      researchOutput = {
        researchSummary:
          "No web research required for this query. Generate the answer using existing context.",
        keyFindings: [],
        sourcesUsed: [],
        researchQuality: "adequate",
      };
    } else {
      // Apply enhancement rules to inject authoritative context for research
      const researchEnhancements = applyEnhancements(args.userQuery, {
        enhanceContext: true,
        enhanceSystemPrompt: true,
      });

      const researchInstructions = buildResearchInstructions({
        userQuery: args.userQuery,
        userIntent: planningResult.finalOutput.userIntent,
        conversationBlock,
        referenceBlock,
        informationNeeded: planningResult.finalOutput.informationNeeded,
        searchQueries: plannedQueries,
        needsWebScraping: planningResult.finalOutput.needsWebScraping,
        enhancedContext: researchEnhancements.enhancedContext || undefined,
        enhancedSystemPrompt:
          researchEnhancements.enhancedSystemPrompt || undefined,
      });

      const researchResult = await withTimeout(
        run(agents.research, researchInstructions, {
          context: { actionCtx: ctx },
          maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
        }),
        AGENT_TIMEOUTS.TOOL_EXECUTION_MS,
        "research",
      );
      researchDuration = Date.now() - researchStart;
      if (!researchResult.finalOutput)
        throw new Error("Research failed: no final output");

      // Validate SDK output with Zod per [ZV1a]
      const validatedOutput = safeParseResearchOutput(
        researchResult.finalOutput,
        workflowId,
      );
      if (!validatedOutput) {
        throw new Error("Research failed: output validation failed");
      }
      researchOutput = validatedOutput;

      const entries = processToolCalls(
        researchResult.newItems ?? [],
        researchStart,
        RunToolCallItem,
        RunToolCallOutputItem,
      );
      const toolErrorCount = Array.from(entries.values()).filter((entry) =>
        isToolErrorOutput(entry.output),
      ).length;
      assertToolErrorThreshold(toolErrorCount, "Research");
      toolCallLog = buildToolCallLog(entries);

      const urlContextMap = buildUrlContextMap(entries);
      const { normalized, invalidCount } = normalizeSourceContextIds(
        researchOutput.sourcesUsed,
        urlContextMap,
      );
      researchOutput.sourcesUsed = normalized;
      if (invalidCount > 0) {
        logWorkflow(
          "CONTEXT_PIPELINE",
          `Context references normalized: ${invalidCount}`,
          {
            workflowId,
          },
        );
      }
    }

    // Synthesis
    const synthesisStart = Date.now();

    // Apply enhancement rules to inject authoritative context
    const synthesisEnhancements = applyEnhancements(args.userQuery, {
      enhanceContext: true,
      enhanceSystemPrompt: true,
    });

    // Transform ResearchOutput to match buildSynthesisInstructions params
    const synthesisInstructions = buildSynthesisInstructions({
      userQuery: args.userQuery,
      userIntent: planningResult.finalOutput.userIntent,
      researchSummary: researchOutput.researchSummary,
      keyFindings: researchOutput.keyFindings,
      sourcesUsed: (researchOutput.sourcesUsed || []).map((s) => ({
        url: s.url ?? "",
        title: s.title ?? "",
        type: s.type,
        relevance: s.relevance ?? "medium",
      })),
      informationGaps: researchOutput.informationGaps ?? undefined,
      scrapedContent: researchOutput.scrapedContent ?? undefined,
      serpEnrichment: researchOutput.serpEnrichment ?? undefined,
      enhancedContext: synthesisEnhancements.enhancedContext || undefined,
      enhancedSystemPrompt:
        synthesisEnhancements.enhancedSystemPrompt || undefined,
    });

    const synthesisResult = await withTimeout(
      run(agents.answerSynthesis, synthesisInstructions, {
        context: { actionCtx: ctx },
        maxTurns: AGENT_LIMITS.MAX_AGENT_TURNS,
      }),
      AGENT_TIMEOUTS.AGENT_STAGE_MS,
      "synthesis",
    );
    const synthesisDuration = Date.now() - synthesisStart;
    const totalDuration = Date.now() - startTime;
    const rawAnswerText =
      typeof synthesisResult.finalOutput === "string"
        ? synthesisResult.finalOutput
        : "";
    if (!rawAnswerText) throw new Error("Synthesis failed: no text output");
    const strippedAnswer = stripTrailingSources(rawAnswerText);
    const parsedAnswer = parseAnswerText(strippedAnswer);

    const normalizedPlanning = {
      ...planningResult.finalOutput,
      anticipatedChallenges:
        planningResult.finalOutput.anticipatedChallenges ?? undefined,
    };
    const normalizedResearch = {
      ...researchOutput,
      informationGaps: researchOutput.informationGaps ?? undefined,
    };
    const normalizedAnswer = {
      ...parsedAnswer,
      limitations: parsedAnswer.limitations ?? undefined,
    };

    return {
      workflowId,
      toolCallLog,
      planning: normalizedPlanning,
      research: normalizedResearch,
      answer: normalizedAnswer,
      metadata: {
        totalDuration,
        planningDuration,
        researchDuration,
        synthesisDuration,
        timestamp: Date.now(),
      },
    };
  },
});
