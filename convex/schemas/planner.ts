/**
 * LLM Planner Schemas
 *
 * Zod validation for LLM planning responses.
 * Per [VL1d]: Single source of truth for planner types.
 * Per [ZV1]: Validate external LLM responses at boundary.
 */

import { z } from "zod/v4";

/**
 * LLM Plan response schema.
 * All fields optional since LLM output may be incomplete.
 */
export const LLMPlanSchema = z.object({
  shouldSearch: z.boolean().optional(),
  contextSummary: z.string().optional(),
  queries: z.array(z.string()).optional(),
  suggestNewChat: z.boolean().optional(),
  decisionConfidence: z.number().min(0).max(1).optional(),
  reasons: z.string().optional(),
});

export type LLMPlan = z.infer<typeof LLMPlanSchema>;
