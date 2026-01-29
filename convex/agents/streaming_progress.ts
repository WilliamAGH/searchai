"use node";

/** Map tool names to workflow progress stages */
export type ProgressStage =
  | "thinking"
  | "planning"
  | "searching"
  | "scraping"
  | "generating";

const TOOL_TO_STAGE: Record<string, ProgressStage> = {
  plan_research: "planning",
  search_web: "searching",
  scrape_webpage: "scraping",
};

/**
 * Get the progress stage for a tool call, if it represents a stage transition.
 * Returns null if the tool doesn't map to a stage or if already in that stage.
 */
export function getProgressStageForTool(
  toolName: string,
  currentStage: ProgressStage,
): ProgressStage | null {
  const newStage = TOOL_TO_STAGE[toolName];
  if (newStage && newStage !== currentStage) {
    return newStage;
  }
  return null;
}

/**
 * Get human-readable message for a progress stage.
 *
 * IMPORTANT: Messages must NOT start with the same word as the UI label
 * to avoid redundancy like "Planning Planning research strategy...".
 *
 * UI labels are: Thinking, Planning, Searching, Reading (scraping),
 * Analyzing, Writing (generating), Working (default).
 */
export function getProgressMessage(stage: ProgressStage): string {
  switch (stage) {
    case "thinking":
      return "about your question...";
    case "planning":
      return "research strategy...";
    case "searching":
      return "the web...";
    case "scraping":
      return "source content...";
    case "generating":
      return "response...";
    default:
      return "on request...";
  }
}
