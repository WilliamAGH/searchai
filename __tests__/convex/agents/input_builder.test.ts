import { describe, expect, it, vi } from "vitest";

vi.mock("../../../convex/lib/providers/openai_resolver", () => ({
  resolveOpenAIEndpoint: vi.fn(),
}));

import { resolveOpenAIEndpoint } from "../../../convex/lib/providers/openai_resolver";
import { buildAgentInput } from "../../../convex/agents/input_builder";

describe("buildAgentInput", () => {
  it("returns a plain string when no images are present", () => {
    const input = buildAgentInput({
      userQuery: "What is TypeScript?",
      conversationContext: "",
      imageUrls: [],
    });

    expect(typeof input).toBe("string");
    expect(input).toBe("What is TypeScript?");
  });

  it("returns a plain string when images are present but attachImages is false", () => {
    const input = buildAgentInput({
      userQuery: "Describe this image",
      conversationContext: "",
      imageUrls: ["https://example.com/image.png"],
      imageAnalysis: "A screenshot with a single headline.",
    });

    expect(typeof input).toBe("string");
    if (typeof input !== "string") throw new Error("Expected string input");

    expect(input).toContain("[IMAGE ANALYSIS]");
    expect(input).toContain("A screenshot with a single headline.");
    expect(input).toContain("Describe this image");
    expect(vi.mocked(resolveOpenAIEndpoint)).not.toHaveBeenCalled();
  });

  it("uses Responses API detail shape for OpenAI endpoints", () => {
    vi.mocked(resolveOpenAIEndpoint).mockReturnValue({
      baseURL: "https://api.openai.com/v1",
      isOpenRouter: false,
      isOpenAIEndpoint: true,
      isChatCompletionsEndpoint: false,
    });

    const input = buildAgentInput({
      userQuery: "What is in this image?",
      conversationContext: "",
      imageUrls: ["https://example.com/image.png"],
      imageAnalysis: "A screenshot with a single headline.",
      attachImages: true,
    });

    expect(Array.isArray(input)).toBe(true);
    if (!Array.isArray(input)) throw new Error("Expected AgentInputItem[]");

    const content = input[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) throw new Error("Expected content array");

    const imageItem = content.find((c) => c.type === "input_image");
    expect(imageItem).toBeTruthy();
    if (!imageItem || imageItem.type !== "input_image") {
      throw new Error("Expected an input_image item");
    }

    expect(imageItem.providerData).toEqual({ detail: "high" });
  });

  it("uses Chat Completions image_url shape for OpenRouter endpoints", () => {
    vi.mocked(resolveOpenAIEndpoint).mockReturnValue({
      baseURL: "https://openrouter.ai/api/v1",
      isOpenRouter: true,
      isOpenAIEndpoint: false,
      isChatCompletionsEndpoint: true,
    });

    const input = buildAgentInput({
      userQuery: "What is in this image?",
      conversationContext: "",
      imageUrls: ["https://example.com/image.png"],
      imageAnalysis: "A screenshot with a single headline.",
      attachImages: true,
    });

    expect(Array.isArray(input)).toBe(true);
    if (!Array.isArray(input)) throw new Error("Expected AgentInputItem[]");

    const content = input[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) throw new Error("Expected content array");

    const imageItem = content.find((c) => c.type === "input_image");
    expect(imageItem).toBeTruthy();
    if (!imageItem || imageItem.type !== "input_image") {
      throw new Error("Expected an input_image item");
    }

    expect(imageItem.providerData).toEqual({
      image_url: { detail: "high" },
    });
  });

  it("injects image analysis context into text input", () => {
    vi.mocked(resolveOpenAIEndpoint).mockReturnValue({
      baseURL: "https://api.openai.com/v1",
      isOpenRouter: false,
      isOpenAIEndpoint: true,
      isChatCompletionsEndpoint: false,
    });

    const input = buildAgentInput({
      userQuery: "Describe this",
      conversationContext: "",
      imageUrls: ["https://example.com/img.png"],
      imageAnalysis: "A red circle on white background",
      attachImages: true,
    });

    expect(Array.isArray(input)).toBe(true);
    if (!Array.isArray(input)) throw new Error("Expected AgentInputItem[]");

    const content = input[0]?.content;
    if (!Array.isArray(content)) throw new Error("Expected content array");

    const textItem = content.find((c) => c.type === "input_text");
    if (!textItem || textItem.type !== "input_text") {
      throw new Error("Expected input_text item");
    }

    expect(textItem.text).toContain("[IMAGE ANALYSIS]");
    expect(textItem.text).toContain("A red circle on white background");
  });
});
