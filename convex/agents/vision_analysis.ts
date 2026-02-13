"use node";

/**
 * Vision Pre-Analysis
 *
 * Generates a structured, factual description of attached images before the
 * conversational agent runs. The description is persisted on the user message
 * (imageAnalysis) and injected into the agent's context so subsequent turns
 * can reference image content without re-sending pixels.
 *
 * Uses a direct Chat Completions call (single-turn, no tools needed) rather
 * than the Agents SDK `run()` to avoid unnecessary overhead.
 */

import {
  getOpenAIEnvironment,
  getVisionModelName,
} from "../lib/providers/openai";
import { CONTENT_LIMITS } from "../lib/constants/cache";
import { truncate } from "./helpers_utils";

const VISION_ANALYSIS_SYSTEM_PROMPT = `You are a precise image analyst. Your job is to produce a thorough, factual description of the image(s) provided.

INSTRUCTIONS:
- Describe every significant subject, object, and element visible in the image.
- Transcribe ALL visible text, labels, numbers, and captions exactly as they appear.
- For screenshots: describe UI elements, layout, visible state, and any error messages.
- For charts/graphs: describe axes, labels, data points, trends, and legend entries.
- For documents/receipts: transcribe all readable text with its spatial layout.
- For photos: describe subjects, colors, lighting, composition, and spatial relationships.
- Note anything that is unclear, blurry, or partially occluded — say so explicitly.
- NEVER speculate about content you cannot see. If something is ambiguous, state that.
- NEVER fabricate text, numbers, or details not visible in the image.
- Be concise but complete. Aim for the level of detail needed to answer questions about the image without seeing it again.`;

interface AnalyzeImagesParams {
  imageUrls: string[];
  userQuery: string;
}

interface AnalyzeImagesResult {
  description: string;
}

export function buildVisionAnalysisUserPromptText(userQuery: string): string {
  const userQueryContext = truncate(
    userQuery.trim(),
    CONTENT_LIMITS.VISION_USER_QUERY_CONTEXT_CHARS,
  );
  return `Describe the image(s) thoroughly. The user's question for context: "${userQueryContext}"`;
}

/**
 * Analyze images via a single-turn vision completion.
 *
 * @throws if the API call fails (caller treats this as fatal for image turns)
 */
export async function analyzeImages(
  params: AnalyzeImagesParams,
): Promise<AnalyzeImagesResult> {
  const { imageUrls, userQuery } = params;
  const env = getOpenAIEnvironment();
  const model = getVisionModelName();

  const imageContentParts = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  const response = await env.client.chat.completions.create({
    model,
    temperature: 0.1,
    // OpenAI supports `max_completion_tokens`; many OpenAI-compatible endpoints only
    // support `max_tokens` for Chat Completions.
    ...(env.isOpenAIEndpoint
      ? { max_completion_tokens: 1024 }
      : { max_tokens: 1024 }),
    messages: [
      { role: "system", content: VISION_ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildVisionAnalysisUserPromptText(userQuery),
          },
          ...imageContentParts,
        ],
      },
    ],
  });

  const description = response.choices[0]?.message?.content;
  if (!description) {
    throw new Error("Vision analysis returned empty content");
  }

  return { description };
}
