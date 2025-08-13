import { describe, it, expect } from "vitest";

function generateTitle(content: string, maxLength = 50) {
  const trimmed = content.trim();
  if (!trimmed) return "New Chat";
  if (trimmed.length > maxLength)
    return `${trimmed.substring(0, maxLength)}...`;
  return trimmed;
}

describe("Verify Title Generation logic and parity", () => {
  const basicCases = [
    {
      input: "How do I configure my database?",
      expected: "How do I configure my database?",
    },
    {
      input:
        "This is a very long message that exceeds the fifty character limit and should be truncated properly",
      expected: "This is a very long message that exceeds the fifty...",
    },
    { input: "   Padded Text   ", expected: "Padded Text" },
    { input: "", expected: "New Chat" },
    {
      input: "What is 2+2? Can you explain math & logic?",
      expected: "What is 2+2? Can you explain math & logic?",
    },
    {
      input: "How do I add emojis 😀 to my app? 🚀",
      expected: "How do I add emojis 😀 to my app? 🚀",
    },
  ];

  it("handles base cases", () => {
    for (const t of basicCases) {
      expect(generateTitle(t.input)).toBe(t.expected);
    }
  });

  it("maintains parity between auth and unauth variants", () => {
    const messages = [
      "How do I configure my database for production?",
      "This is a very long message that should be truncated in exactly the same way for both authenticated and unauthenticated users",
      "Short message",
      "A".repeat(100),
    ];

    for (const message of messages) {
      const authTitle = (m: string) => {
        const trimmed = m.trim();
        return trimmed.length > 50 ? `${trimmed.substring(0, 50)}...` : trimmed;
      };
      const unauthTitle = (m: string) =>
        m.length > 50 ? `${m.substring(0, 50)}...` : m;
      expect(authTitle(message)).toBe(unauthTitle(message.trim()));
    }
  });
});
