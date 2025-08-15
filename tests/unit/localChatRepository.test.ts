// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LocalChatRepository } from "../../src/lib/repositories/LocalChatRepository";

const KEYS = {
  CHATS: "searchai_chats_v2",
  MESSAGES: "searchai_messages_v2",
};

function readJSON<T = any>(key: string): T | null {
  const s = localStorage.getItem(key);
  return s ? (JSON.parse(s) as T) : null;
}

describe("LocalChatRepository (basic operations)", () => {
  const convexUrl = "https://convex.example";
  let repo: LocalChatRepository;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    repo = new LocalChatRepository(convexUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createChat persists sanitized title and default fields", async () => {
    const { chat, isNew } = await repo.createChat("  <b> Hello  World  </b> ");
    expect(isNew).toBe(true);
    expect(chat.id).toBeTruthy();
    // TitleUtils.sanitize removes only '<' and normalizes spaces
    expect(chat.title).toBe("b> Hello World /b>");
    expect(chat.privacy).toBe("private");
    expect(chat.source).toBe("local");
    expect(chat.synced).toBe(false);

    const raw = readJSON<any[]>(KEYS.CHATS);
    expect(raw).toBeTruthy();
    expect(raw!.length).toBeGreaterThan(0);

    const saved = raw![0];
    expect(saved._id).toBe(chat.id);
    expect(saved.title).toBe("b> Hello World /b>");
    expect(saved.isLocal).toBe(true);
  });

  it("addMessage persists one message entry", async () => {
    const { chat } = await repo.createChat("New Chat");

    const m1 = await repo.addMessage(chat.id, {
      role: "user",
      content: "hello",
      timestamp: 2000,
    });
    expect(m1.id).toBeTruthy();

    const rawMessages = readJSON<any[]>(KEYS.MESSAGES)!;
    expect(rawMessages?.length).toBe(1);
    const saved = rawMessages[0];
    expect(saved._id).toBe(m1.id);
    expect(saved.chatId).toBe(chat.id);
    expect(saved.role).toBe("user");
    expect(saved.content).toBe("hello");
  });

  it("getChats returns primed local chats and updateChatTitle persists change", async () => {
    const chatId = "local_chat_1";
    const primed = [
      {
        _id: chatId,
        title: "Primed Chat",
        createdAt: 1,
        updatedAt: 1,
        privacy: "private",
        isLocal: true,
        source: "local",
      },
    ];
    localStorage.setItem(KEYS.CHATS, JSON.stringify(primed));

    // Should map to unified shape with id/source/synced
    const chats = await repo.getChats();
    expect(chats).toHaveLength(1);
    expect(chats[0].id).toBe(chatId);
    expect(chats[0].source).toBe("local");
    expect(chats[0].synced).toBe(false);

    // Update title using repository API (relies on getChats())
    await repo.updateChatTitle(chatId, "  New   Name  ");
    const raw = readJSON<any[]>(KEYS.CHATS)!;
    const saved = raw.find((c) => c._id === chatId)!;
    expect(saved.title).toBe("New Name");
  });

  it("getMessages returns primed messages sorted ascending and shareChat falls back on failure", async () => {
    const chatId = "local_chat_2";
    const primedChats = [
      {
        _id: chatId,
        title: "To Share",
        createdAt: 1,
        updatedAt: 1,
        privacy: "private",
        isLocal: true,
        source: "local",
      },
    ];
    const primedMsgs = [
      {
        _id: "m1",
        chatId,
        role: "assistant",
        content: "hi",
        timestamp: 2000,
        isLocal: true,
        source: "local",
      },
      {
        _id: "m2",
        chatId,
        role: "user",
        content: "hello",
        timestamp: 1000,
        isLocal: true,
        source: "local",
      },
    ];
    localStorage.setItem(KEYS.CHATS, JSON.stringify(primedChats));
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(primedMsgs));

    const msgs = await repo.getMessages(chatId);
    expect(msgs.map((m) => m.id)).toEqual(["m2", "m1"]); // sorted by timestamp asc

    // Force publish failure to trigger local fallback IDs
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network down"));
    const res = await repo.shareChat(chatId, "shared");
    expect(res.shareId).toBeTruthy();
    expect(res.shareId!.startsWith("s_")).toBe(true);

    const raw = readJSON<any[]>(KEYS.CHATS)!;
    const saved = raw.find((c) => c._id === chatId)!;
    expect(saved.privacy).toBe("shared");
    expect(saved.shareId).toBe(res.shareId);
  });

  it("deleteChat removes chat and its messages from storage", async () => {
    const chatIdA = "local_chat_del_A";
    const chatIdB = "local_chat_del_B";
    const primedChats = [
      {
        _id: chatIdA,
        title: "A",
        createdAt: 1,
        updatedAt: 1,
        privacy: "private",
        isLocal: true,
        source: "local",
      },
      {
        _id: chatIdB,
        title: "B",
        createdAt: 1,
        updatedAt: 1,
        privacy: "private",
        isLocal: true,
        source: "local",
      },
    ];
    const primedMsgs = [
      {
        _id: "ma1",
        chatId: chatIdA,
        role: "user",
        content: "a",
        timestamp: 1,
        isLocal: true,
        source: "local",
      },
      {
        _id: "mb1",
        chatId: chatIdB,
        role: "assistant",
        content: "b",
        timestamp: 2,
        isLocal: true,
        source: "local",
      },
      {
        _id: "ma2",
        chatId: chatIdA,
        role: "assistant",
        content: "aa",
        timestamp: 3,
        isLocal: true,
        source: "local",
      },
    ];
    localStorage.setItem(KEYS.CHATS, JSON.stringify(primedChats));
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(primedMsgs));

    await repo.deleteChat(chatIdA);

    const chatsAfter = readJSON<any[]>(KEYS.CHATS)!;
    const msgsAfter = readJSON<any[]>(KEYS.MESSAGES)!;

    expect(chatsAfter.find((c) => c._id === chatIdA)).toBeUndefined();
    expect(chatsAfter.find((c) => c._id === chatIdB)).toBeDefined();

    // Messages for A removed, B preserved
    expect(msgsAfter.find((m) => m.chatId === chatIdA)).toBeUndefined();
    expect(msgsAfter.find((m) => m.chatId === chatIdB)).toBeDefined();
  });
});
