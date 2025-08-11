// Lightweight unit test around currentChat derivation logic idea
// This simulates how we match currentChat by stringified equality over allChats

function deriveCurrentChat(currentChatId, allChats) {
  if (!currentChatId) return undefined;
  const idStr = String(currentChatId);
  return allChats.find((c) => String(c._id) === idStr);
}

function expectEqual(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    throw new Error(
      label + `\nExpected: ${JSON.stringify(b)}\nGot: ${JSON.stringify(a)}`,
    );
  }
}

(async () => {
  const chats = [
    { _id: "local_1", title: "Local A" },
    { _id: "abc123serverid", title: "Server A" },
  ];

  expectEqual(
    deriveCurrentChat("local_1", chats)?.title,
    "Local A",
    "Local chat id matches",
  );
  expectEqual(
    deriveCurrentChat("abc123serverid", chats)?.title,
    "Server A",
    "Server chat id matches",
  );
  expectEqual(
    deriveCurrentChat(null, chats),
    undefined,
    "Null currentChatId returns undefined",
  );
  console.info("✅ currentChat derivation tests passed");
})();
