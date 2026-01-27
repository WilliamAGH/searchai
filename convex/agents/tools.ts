"use node";

/**
 * Agent Tools for Search and Research
 *
 * This module defines tools for the OpenAI Agents SDK with proper type patterns.
 *
 * ## Type Annotation Policy (OpenAI Agents SDK) — [SDK1]
 *
 * **Individual tools**: Use `FunctionTool<any, any, unknown>` annotation.
 * This is required because:
 * 1. Complex execute functions create circular type inference (TS7022)
 * 2. The SDK's type constraints make `unknown` incompatible (TParameters extends ToolInputParameters)
 * 3. Context contravariance prevents assignment to `Tool<unknown>`
 *
 * **Tool arrays**: Use `Tool[]` for Agent.create() compatibility.
 * The `Tool` union type defaults to `Tool<unknown>` which Agent expects.
 *
 * **Why `any` is required here** (exception to [TY1a]):
 * - The SDK's FunctionTool generic has `TParameters extends ToolInputParameters` constraint
 * - `unknown` does NOT satisfy this constraint
 * - `any` is bivariant and works with all SDK type requirements
 * - This is documented SDK behavior, not a workaround
 *
 * @see https://openai.github.io/openai-agents-js/guides/tools
 * @see .cursor/rules/sdk-integration.mdc for canonical policy
 *
 * ## Zod Version Boundary
 *
 * OpenAI Agents SDK requires Zod v3 for tool parameter schemas (peer dependency).
 * Tool implementations import from "zod" (v3). All other application code uses "zod/v4".
 * Keep v3 usage isolated to this SDK integration layer.
 *
 * @module convex/agents/tools
 */

import type { Tool } from "@openai/agents";
import { searchWebTool } from "./tools_search";
import { scrapeWebpageTool } from "./tools_scrape";
import { planResearchTool } from "./tools_plan";

/**
 * All available tools for agents
 */
export const agentTools: {
  searchWeb: typeof searchWebTool;
  scrapeWebpage: typeof scrapeWebpageTool;
  planResearch: typeof planResearchTool;
} = {
  searchWeb: searchWebTool,
  scrapeWebpage: scrapeWebpageTool,
  planResearch: planResearchTool,
};

/**
 * Tool list for the conversational agent (includes planning).
 *
 * Uses `Tool[]` — the SDK-idiomatic type for tool collections passed to Agent.create().
 * The `Tool` union type uses `any` for TParams because heterogeneous tool arrays
 * cannot share a common parameter type. Context is passed at runtime via run().
 *
 * @see Module JSDoc for type annotation policy
 */
export const conversationalToolsList: Tool[] = [
  planResearchTool,
  searchWebTool,
  scrapeWebpageTool,
];

/**
 * Tool list for research-only agents (no planning needed).
 *
 * Uses `Tool[]` — the SDK-idiomatic type for tool collections.
 */
export const toolsList: Tool[] = [searchWebTool, scrapeWebpageTool];
