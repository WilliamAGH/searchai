import { v } from "convex/values";
import {
  vWebResearchSource,
  vScrapedContent,
  vSerpEnrichment,
} from "../lib/validators";

export const orchestrateResearchWorkflowArgs = {
  userQuery: v.string(),
  conversationContext: v.optional(v.string()),
  webResearchSources: v.optional(v.array(vWebResearchSource)),
};

export const orchestrateResearchWorkflowReturns = v.object({
  workflowId: v.string(),
  toolCallLog: v.array(
    v.object({
      toolName: v.string(),
      timestamp: v.number(),
      reasoning: v.string(),
      input: v.any(),
      resultSummary: v.string(),
      durationMs: v.number(),
      success: v.boolean(),
    }),
  ),
  planning: v.object({
    userIntent: v.string(),
    informationNeeded: v.array(v.string()),
    searchQueries: v.array(
      v.object({
        query: v.string(),
        reasoning: v.string(),
        priority: v.number(),
      }),
    ),
    needsWebScraping: v.boolean(),
    anticipatedChallenges: v.optional(v.array(v.string())),
    confidenceLevel: v.number(),
  }),
  research: v.object({
    researchSummary: v.string(),
    keyFindings: v.array(
      v.object({
        finding: v.string(),
        sources: v.array(v.string()),
        confidence: v.union(
          v.literal("high"),
          v.literal("medium"),
          v.literal("low"),
        ),
      }),
    ),
    sourcesUsed: v.array(
      v.object({
        url: v.string(),
        title: v.string(),
        contextId: v.string(),
        type: v.union(
          v.literal("search_result"),
          v.literal("scraped_page"),
          v.literal("research_summary"),
        ),
        relevance: v.union(
          v.literal("high"),
          v.literal("medium"),
          v.literal("low"),
        ),
      }),
    ),
    informationGaps: v.optional(v.array(v.string())),
    researchQuality: v.union(
      v.literal("comprehensive"),
      v.literal("adequate"),
      v.literal("limited"),
    ),
    scrapedContent: v.optional(v.array(vScrapedContent)),
    serpEnrichment: v.optional(vSerpEnrichment),
  }),
  answer: v.object({
    answer: v.string(),
    hasLimitations: v.boolean(),
    limitations: v.optional(v.string()),
    sourcesUsed: v.array(v.string()),
    answerCompleteness: v.union(
      v.literal("complete"),
      v.literal("partial"),
      v.literal("insufficient"),
    ),
    confidence: v.number(),
  }),
  metadata: v.object({
    totalDuration: v.number(),
    planningDuration: v.number(),
    researchDuration: v.number(),
    synthesisDuration: v.number(),
    timestamp: v.number(),
  }),
});
