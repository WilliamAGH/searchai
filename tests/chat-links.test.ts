import { describe, it, expect } from "vitest";
import { buildHumanShareUrl, buildLlmTxtUrl } from "../src/lib/share.ts";

const origin = "http://localhost:3000";

describe("share URL builders", () => {
  it("human url: shared -> /s/:id", () => {
    const url = buildHumanShareUrl("shared", { shareId: "abc123" }, origin);
    expect(url).toBe(`${origin}/s/abc123`);
  });

  it("human url: public -> /p/:id", () => {
    const url = buildHumanShareUrl("public", { publicId: "pub123" }, origin);
    expect(url).toBe(`${origin}/p/pub123`);
  });

  it("human url: private -> /chat/:id", () => {
    const url = buildHumanShareUrl("private", { chatId: "chat999" }, origin);
    expect(url).toBe(`${origin}/chat/chat999`);
  });

  it("llm url: shared -> /api/chatTextMarkdown?shareId=...", () => {
    const url = buildLlmTxtUrl("shared", { shareId: "abc 123" }, origin);
    expect(url).toBe(`${origin}/api/chatTextMarkdown?shareId=abc%20123`);
  });

  it("llm url: llm -> /api/chatTextMarkdown?shareId=...", () => {
    const url = buildLlmTxtUrl("llm", { shareId: "xyz789" }, origin);
    expect(url).toBe(`${origin}/api/chatTextMarkdown?shareId=xyz789`);
  });

  it("llm url: public -> null", () => {
    const url = buildLlmTxtUrl("public", { shareId: "irrelevant" }, origin);
    expect(url).toBeNull();
  });
});
