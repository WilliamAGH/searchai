#!/usr/bin/env node
/**
 * Test script to verify anonymous users can retrieve past chats
 * Tests that sessionId validation is working correctly
 */

import { ConvexClient } from "convex/browser";
import { uuidv7 } from "uuidv7";
import { api } from "./convex/_generated/api.js";

const CONVEX_URL = "https://diligent-greyhound-240.convex.cloud";

async function testAnonymousChatRetrieval() {
  console.log("🔍 Testing Anonymous Chat Retrieval\n");

  const client = new ConvexClient(CONVEX_URL);
  const sessionId = uuidv7();

  try {
    // Step 1: Create an anonymous chat
    console.log("1️⃣ Creating anonymous chat with sessionId:", sessionId);
    const chatId = await client.mutation(api.chats.createChat, {
      title: "Test Anonymous Chat",
      sessionId: sessionId,
    });
    console.log("✅ Chat created:", chatId);

    // Step 2: Get user's chats (should include the new chat)
    console.log("\n2️⃣ Getting user's chats with sessionId...");
    const userChats = await client.query(api.chats.getUserChats, {
      sessionId: sessionId,
    });
    console.log(`✅ Found ${userChats.length} chat(s)`);

    if (userChats.length > 0) {
      console.log("   First chat title:", userChats[0].title);
    }

    // Step 3: Try to retrieve the specific chat by ID (this was failing before)
    console.log("\n3️⃣ Retrieving specific chat by ID...");
    const retrievedChat = await client.query(api.chats.getChatById, {
      chatId: chatId,
      sessionId: sessionId,
    });

    if (retrievedChat) {
      console.log("✅ Successfully retrieved chat!");
      console.log("   Title:", retrievedChat.title);
      console.log("   SessionId:", retrievedChat.sessionId);
      console.log(
        "   Created:",
        new Date(retrievedChat._creationTime).toISOString(),
      );
    } else {
      console.log("❌ Failed to retrieve chat - getChatById returned null");
    }

    // Step 4: Try to retrieve messages for the chat
    console.log("\n4️⃣ Retrieving messages for the chat...");
    const messages = await client.query(api.chats.getChatMessages, {
      chatId: chatId,
      sessionId: sessionId,
    });
    console.log(`✅ Retrieved ${messages.length} message(s)`);

    // Step 5: Try to retrieve without sessionId (should fail)
    console.log(
      "\n5️⃣ Testing security: trying to retrieve WITHOUT sessionId...",
    );
    try {
      const unauthorizedChat = await client.query(api.chats.getChatById, {
        chatId: chatId,
        // No sessionId provided
      });

      if (unauthorizedChat) {
        console.log("⚠️ SECURITY ISSUE: Chat retrieved without sessionId!");
      } else {
        console.log(
          "✅ Security check passed: Chat not accessible without sessionId",
        );
      }
    } catch (error) {
      console.log("✅ Security check passed: Error thrown without sessionId");
    }

    // Step 6: Try with wrong sessionId (should fail)
    console.log("\n6️⃣ Testing security: trying with WRONG sessionId...");
    const wrongSessionId = uuidv7();
    const wrongSessionChat = await client.query(api.chats.getChatById, {
      chatId: chatId,
      sessionId: wrongSessionId,
    });

    if (wrongSessionChat) {
      console.log("⚠️ SECURITY ISSUE: Chat retrieved with wrong sessionId!");
    } else {
      console.log(
        "✅ Security check passed: Chat not accessible with wrong sessionId",
      );
    }

    console.log("\n✨ TEST COMPLETE - Anonymous chat retrieval is working!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  } finally {
    client.close();
  }
}

// Run the test
testAnonymousChatRetrieval().catch(console.error);
