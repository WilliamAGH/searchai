/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import type { ChatState } from "../../../../src/hooks/useChatState";

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module-under-test is imported
// ---------------------------------------------------------------------------

vi.mock("@/hooks/utils/streamHandler", () => ({
  StreamEventHandler: vi.fn().mockImplementation(() => ({
    handle: vi.fn(),
    getPersistedConfirmed: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock("@/hooks/utils/messageStateUpdaters", () => ({
  updateMessageById: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/types/message", () => ({
  createLocalUIMessage: vi.fn(
    (params: {
      id: string;
      chatId: string;
      role: string;
      content: string;
    }) => ({
      _id: params.id,
      id: params.id,
      chatId: params.chatId,
      role: params.role,
      content: params.content,
      timestamp: Date.now(),
      isStreaming: false,
    }),
  ),
}));

vi.mock("@/lib/types/unified", () => ({
  IdUtils: {
    generateLocalId: vi.fn(
      (prefix: string) => `${prefix}-${Date.now()}-${Math.random()}`,
    ),
    toConvexChatId: vi.fn((id: string) => id),
    toConvexMessageId: vi.fn((id: string) => id),
  },
}));

vi.mock("@/lib/utils/errorUtils", () => ({
  getErrorMessage: vi.fn((err: unknown) =>
    err instanceof Error ? err.message : String(err),
  ),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { sendMessageWithStreaming } from "../../../../src/hooks/chatActions/sendMessage";
import type { IChatRepository } from "../../../../src/lib/repositories/ChatRepository";
import type { MessageStreamChunk } from "../../../../src/lib/types/message";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a repository whose generateResponse yields given chunks with optional delay. */
function repoWithChunks(
  chunks: MessageStreamChunk[],
  delayMs = 0,
): IChatRepository {
  async function* gen(): AsyncGenerator<MessageStreamChunk> {
    for (const chunk of chunks) {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      yield chunk;
    }
  }
  return {
    generateResponse: vi.fn(() => gen()),
  } as unknown as IChatRepository;
}

function throwingGenerator(
  error: Error,
): AsyncGenerator<MessageStreamChunk, void, unknown> {
  return {
    async next(): Promise<IteratorResult<MessageStreamChunk, void>> {
      throw error;
    },
    async return(): Promise<IteratorResult<MessageStreamChunk, void>> {
      return { done: true, value: undefined };
    },
    async throw(
      thrown?: unknown,
    ): Promise<IteratorResult<MessageStreamChunk, void>> {
      throw thrown ?? error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendMessageWithStreaming", () => {
  let setState: Dispatch<SetStateAction<ChatState>>;
  let stateUpdates: Array<ChatState | ((prev: ChatState) => ChatState)>;

  beforeEach(() => {
    stateUpdates = [];
    setState = vi.fn((update) => {
      stateUpdates.push(update as ChatState | ((prev: ChatState) => ChatState));
    }) as unknown as Dispatch<SetStateAction<ChatState>>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Queue serialization
  // -----------------------------------------------------------------------

  it("serializes tasks for the same chatId", async () => {
    const order: number[] = [];

    const repo1 = {
      generateResponse: vi.fn(async function* () {
        await new Promise((r) => setTimeout(r, 50));
        order.push(1);
        yield { type: "complete" as const };
      }),
    } as unknown as IChatRepository;

    const repo2 = {
      generateResponse: vi.fn(async function* () {
        order.push(2);
        yield { type: "complete" as const };
      }),
    } as unknown as IChatRepository;

    const p1 = sendMessageWithStreaming({
      repository: repo1,
      setState,
      chatId: "chat-A",
      content: "first",
    });

    const p2 = sendMessageWithStreaming({
      repository: repo2,
      setState,
      chatId: "chat-A",
      content: "second",
    });

    await Promise.all([p1, p2]);

    // Task 1 should complete before task 2 starts generating
    expect(order).toEqual([1, 2]);
  });

  it("allows concurrent execution for different chatIds", async () => {
    const running: string[] = [];

    function makeRepo(label: string): IChatRepository {
      return {
        generateResponse: vi.fn(async function* () {
          running.push(`start:${label}`);
          await new Promise((r) => setTimeout(r, 30));
          running.push(`end:${label}`);
          yield { type: "complete" as const };
        }),
      } as unknown as IChatRepository;
    }

    const p1 = sendMessageWithStreaming({
      repository: makeRepo("A"),
      setState,
      chatId: "chat-A",
      content: "msg",
    });

    const p2 = sendMessageWithStreaming({
      repository: makeRepo("B"),
      setState,
      chatId: "chat-B",
      content: "msg",
    });

    await Promise.all([p1, p2]);

    // Both should start before either ends (concurrent)
    const startA = running.indexOf("start:A");
    const startB = running.indexOf("start:B");
    const endA = running.indexOf("end:A");
    const endB = running.indexOf("end:B");

    expect(startA).toBeLessThan(endA);
    expect(startB).toBeLessThan(endB);
    // Both start before the first one ends
    expect(startB).toBeLessThan(endA);
  });

  it("continues queue if earlier task throws", async () => {
    const order: string[] = [];

    const failRepo = {
      generateResponse: vi.fn(() => {
        order.push("fail-start");
        return throwingGenerator(new Error("Stream failed"));
      }),
    } as unknown as IChatRepository;

    const successRepo = {
      generateResponse: vi.fn(async function* () {
        order.push("success-start");
        yield { type: "complete" as const };
      }),
    } as unknown as IChatRepository;

    // Both enqueue to same chatId
    const p1 = sendMessageWithStreaming({
      repository: failRepo,
      setState,
      chatId: "chat-A",
      content: "will-fail",
    });

    const p2 = sendMessageWithStreaming({
      repository: successRepo,
      setState,
      chatId: "chat-A",
      content: "should-run",
    });

    const results = await Promise.allSettled([p1, p2]);

    // p1 should reject (error now propagates to caller)
    expect(results[0]?.status).toBe("rejected");
    // p2 should still succeed (queue continues despite earlier failure)
    expect(results[1]?.status).toBe("fulfilled");

    expect(order).toContain("fail-start");
    expect(order).toContain("success-start");
  });

  // -----------------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------------

  it("returns early when content is empty and no images", async () => {
    const repo = repoWithChunks([]);

    await sendMessageWithStreaming({
      repository: repo,
      setState,
      chatId: "chat-A",
      content: "",
    });

    expect(repo.generateResponse).not.toHaveBeenCalled();
  });

  it("proceeds when content is empty but images are provided", async () => {
    const repo = repoWithChunks([{ type: "complete" as const }]);

    await sendMessageWithStreaming({
      repository: repo,
      setState,
      chatId: "chat-A",
      content: "",
      imageStorageIds: ["storage-1"],
    });

    expect(repo.generateResponse).toHaveBeenCalled();
  });
});
