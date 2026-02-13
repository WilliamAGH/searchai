import { describe, expect, it } from "vitest";

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
  });

  it("omits providerData so SDK defaults handle image detail", () => {
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

    expect(imageItem).toEqual({
      type: "input_image",
      image: "https://example.com/image.png",
    });
  });

  it("includes unavailable-analysis note when images lack pre-analysis", () => {
    const input = buildAgentInput({
      userQuery: "What is in this image?",
      conversationContext: "",
      imageUrls: ["https://example.com/image.png"],
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

    expect(textItem.text).toContain(
      "[ERROR] Image pre-analysis was unavailable",
    );
  });

  it("injects image analysis context into text input", () => {
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

  it("truncates image analysis exceeding 8000 chars and appends truncation note", () => {
    const longAnalysis = "x".repeat(9000);
    const input = buildAgentInput({
      userQuery: "Describe this",
      conversationContext: "",
      imageUrls: ["https://example.com/img.png"],
      imageAnalysis: longAnalysis,
    });

    expect(typeof input).toBe("string");
    if (typeof input !== "string") throw new Error("Expected string input");

    expect(input).toContain(
      "[NOTE] Image analysis truncated for context limits.",
    );
    // The truncated analysis + surrounding markup must be bounded
    expect(input.length).toBeLessThan(longAnalysis.length);
  });

  it("orders sections correctly: conversation context, image analysis, user query", () => {
    const input = buildAgentInput({
      userQuery: "What do you see?",
      conversationContext: "User: Hello\nAssistant: Hi there",
      imageUrls: ["https://example.com/img.png"],
      imageAnalysis: "A blue square",
    });

    expect(typeof input).toBe("string");
    if (typeof input !== "string") throw new Error("Expected string input");

    const contextIdx = input.indexOf("Previous conversation:");
    const analysisIdx = input.indexOf("[IMAGE ANALYSIS]");
    const queryIdx = input.lastIndexOf("User: What do you see?");

    expect(contextIdx).toBeGreaterThanOrEqual(0);
    expect(analysisIdx).toBeGreaterThan(contextIdx);
    expect(queryIdx).toBeGreaterThan(analysisIdx);
  });
});
