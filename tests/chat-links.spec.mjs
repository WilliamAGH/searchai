// Unit tests for URL builders used by share logic
import assert from "node:assert/strict";
import { buildHumanShareUrl, buildLlmTxtUrl } from "../src/lib/share.mjs";

function run(name, fn) {
  try {
    fn();
    console.info(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    throw e;
  }
}

const origin = "http://localhost:3000";

run("human url: shared -> /s/:id", () => {
  const url = buildHumanShareUrl("shared", { shareId: "abc123" }, origin);
  assert.equal(url, `${origin}/s/abc123`);
});

run("human url: public -> /p/:id", () => {
  const url = buildHumanShareUrl("public", { publicId: "pub123" }, origin);
  assert.equal(url, `${origin}/p/pub123`);
});

run("human url: private -> /chat/:id", () => {
  const url = buildHumanShareUrl("private", { chatId: "chat999" }, origin);
  assert.equal(url, `${origin}/chat/chat999`);
});

run("llm url: shared -> /api/chatTextMarkdown?shareId=...", () => {
  const url = buildLlmTxtUrl("shared", { shareId: "abc 123" }, origin);
  assert.equal(url, `${origin}/api/chatTextMarkdown?shareId=abc%20123`);
});

run("llm url: llm -> /api/chatTextMarkdown?shareId=...", () => {
  const url = buildLlmTxtUrl("llm", { shareId: "xyz789" }, origin);
  assert.equal(url, `${origin}/api/chatTextMarkdown?shareId=xyz789`);
});

run("llm url: public -> null", () => {
  const url = buildLlmTxtUrl("public", { shareId: "irrelevant" }, origin);
  assert.equal(url, null);
});

console.info("All share URL unit tests passed");
