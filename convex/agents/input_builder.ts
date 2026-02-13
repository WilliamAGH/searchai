"use node";

/**
 * Agent Input Builder
 *
 * Constructs the multimodal input for the conversational agent, including
 * image analysis context and detail-level configuration for vision requests.
 */

import type { AgentInputItem } from "@openai/agents";
import { resolveOpenAIEndpoint } from "../lib/providers/openai_resolver";

export interface BuildAgentInputParams {
  userQuery: string;
  conversationContext: string;
  imageUrls: string[];
  imageAnalysis?: string;
  attachImages?: boolean;
}

/**
 * Build agent input with optional image analysis context.
 *
 * When images are present, we inject the persisted `[IMAGE ANALYSIS]` text block
 * into the input. Reattaching the raw images is optional via `attachImages`.
 *
 * When no images are present, returns a plain string.
 */
export function buildAgentInput(
  params: BuildAgentInputParams,
): string | AgentInputItem[] {
  const {
    userQuery,
    conversationContext,
    imageUrls,
    imageAnalysis,
    attachImages = false,
  } = params;

  const imageContext = imageAnalysis
    ? `\n\n[IMAGE ANALYSIS]\n${imageAnalysis}\n[/IMAGE ANALYSIS]`
    : "";

  const textInput = conversationContext
    ? `Previous conversation:\n${conversationContext}${imageContext}\n\nUser: ${userQuery}`
    : `${imageContext ? imageContext + "\n\n" : ""}${userQuery}`;

  if (imageUrls.length === 0) {
    return textInput;
  }

  if (!attachImages) {
    return textInput;
  }

  // The Agents SDK supports both OpenAI Responses API and Chat Completions.
  // The "detail" field is shaped differently between them:
  // - Responses: `input_image.detail = "high"`
  // - Chat Completions: `{ type: "image_url", image_url: { url, detail: "high" } }`
  //
  // We pass providerData in the correct shape for the active API mode.
  const endpoint = resolveOpenAIEndpoint();
  const useChatCompletionsAPI =
    !endpoint.isOpenAIEndpoint ||
    endpoint.isOpenRouter ||
    endpoint.isChatCompletionsEndpoint;
  const imageProviderData = useChatCompletionsAPI
    ? { image_url: { detail: "high" } }
    : { detail: "high" };

  const imageContentItems = imageUrls.map((url) => ({
    type: "input_image" as const,
    image: url,
    providerData: imageProviderData,
  }));

  return [
    {
      role: "user" as const,
      content: [
        { type: "input_text" as const, text: textInput },
        ...imageContentItems,
      ],
    },
  ];
}
