"use node";
/**
 * Main generation pipeline orchestration
 * Coordinates search, context building, and streaming response generation
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { buildContextSummary } from "./context";
import { applyEnhancements } from "../enhancements";
import { streamOpenRouter } from "./streaming";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Generate streaming AI response
 * - Adds user message to chat
 * - Creates assistant placeholder
 * - Schedules internal generation
 * - Non-blocking async execution
 * @param chatId - Chat to append to
 * @param message - User's message text
 */
export const generateStreamingResponse = action({
  args: {
    chatId: v.id("chats"),
    message: v.string(),
    isReplyToAssistant: v.optional(v.boolean()), // NEW: Track if replying to assistant
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Ignore empty or whitespace-only input
    const trimmed = args.message.trim();
    if (!trimmed) {
      return null;
    }
    // Use transaction for atomic operations
    const result = await ctx.runMutation(
      internal.messages.addMessageWithTransaction,
      {
        chatId: args.chatId,
        userMessage: trimmed,
        isReplyToAssistant: args.isReplyToAssistant,
      },
    );

    if (!result.success || !result.assistantMessageId) {
      throw new Error(
        `Failed to add messages: ${result.error || "No assistant message ID returned"}`,
      );
    }

    const assistantMessageId = result.assistantMessageId;

    // 3. Start the generation process without blocking
    try {
      console.info("📝 Scheduling generation step:", {
        chatId: args.chatId,
        assistantMessageId,
        userMessage: trimmed.substring(0, 100),
      });

      await ctx.scheduler.runAfter(0, internal.ai.generationStep, {
        chatId: args.chatId,
        assistantMessageId,
        userMessage: trimmed,
      });

      console.info("✅ Generation step scheduled successfully");
    } catch (error) {
      console.error("❌ Failed to schedule generation step:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    return null;
  },
});

/**
 * Internal generation orchestrator
 * - Plans context-aware search
 * - Scrapes top 3 results
 * - Builds system prompt with sources
 * - Streams response with 100ms batching
 * - Updates rolling summary
 * - Handles errors gracefully
 * @param chatId - Chat context
 * @param assistantMessageId - Message to update
 * @param userMessage - User's query
 */
export const generationStep = internalAction({
  args: {
    chatId: v.id("chats"),
    assistantMessageId: v.id("messages"),
    userMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.info("🔥 Generation step started:", {
      chatId: args.chatId,
      assistantMessageId: args.assistantMessageId,
      userMessageLength: args.userMessage.length,
      timestamp: new Date().toISOString(),
    });

    // 1. Build secure context FIRST and check if rolling summary needs update
    // Get messages via query since we're in an action context
    const messages = await ctx.runQuery(api.chats.getChatMessages, {
      chatId: args.chatId,
    });
    const chat = await ctx.runQuery(api.chats.getChatById, {
      chatId: args.chatId,
    });

    // Build context from messages
    const contextSummary = buildContextSummary(messages.slice(-50));
    const shouldUpdateSummary =
      !chat?.rollingSummaryUpdatedAt ||
      Date.now() - chat.rollingSummaryUpdatedAt > 5 * 60 * 1000;

    const secureContext = {
      summary: contextSummary,
      recentMessages: messages.slice(-5),
      shouldUpdateSummary,
    };

    // 2. Update rolling summary BEFORE generation if needed
    if (secureContext.shouldUpdateSummary) {
      try {
        await ctx.runMutation(internal.chats.updateRollingSummary, {
          chatId: args.chatId,
          summary: secureContext.summary,
        });
      } catch (e) {
        console.warn("Failed to update rolling summary before generation", e);
      }
    }

    // Apply comprehensive message enhancements
    const enhancements = applyEnhancements(args.userMessage, {
      enhanceQuery: true,
      enhanceSearchTerms: true,
      injectSearchResults: true,
      enhanceContext: true,
      enhanceSystemPrompt: true,
      enhanceResponse: true,
    });

    const enhancedUserMessage = enhancements.enhancedQuery;

    try {
      // 4. Plan and perform context-aware web search
      // Build up reasoning content to show thinking process
      let accumulatedReasoning = "Planning search...\n";

      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: "Planning search...",
        reasoning: accumulatedReasoning,
      });

      const plan = await ctx.runAction(api.search.planSearch, {
        chatId: args.chatId,
        newMessage: enhancedUserMessage,
        maxContextMessages: 10,
      });

      // Add search planning results to reasoning
      accumulatedReasoning += plan.shouldSearch
        ? `\nSearching the web with ${plan.queries.length} queries:\n${plan.queries.map((q: string, i: number) => `  ${i + 1}. ${q}`).join("\n")}\n\nReason: ${plan.reasons}\n`
        : `\nNo search needed. Reason: ${plan.reasons}\n`;

      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: plan.shouldSearch
          ? `Searching the web (queries: ${plan.queries.length})...`
          : "Analyzing without search...",
        reasoning: accumulatedReasoning,
      });

      let aggregated: Array<{
        title: string;
        url: string;
        snippet: string;
        relevanceScore: number;
      }> = [];
      if (plan.shouldSearch) {
        // Augment queries with context keywords for better recall
        // Build a fresh, recency-weighted summary to extract terms (robust if planner summary is sparse)
        const allMsgs: Array<{
          role: "user" | "assistant" | "system";
          content?: string;
          timestamp?: number;
        }> = await ctx.runQuery(api.chats.getChatMessages, {
          chatId: args.chatId,
        });
        const freshSummary = buildContextSummary(allMsgs);
        // Merge enhancement search terms to enrich context-derived terms
        const ctxTerms = Array.from(
          new Set([
            ...(freshSummary || "")
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter(Boolean),
            ...enhancements.enhancedSearchTerms.map((s) => s.toLowerCase()),
          ]),
        ).slice(0, 18);
        // Extract up to 2 quoted bigrams/trigrams for precision
        const tokens = (freshSummary || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        const ngrams = new Set<string>();
        for (let i = 0; i < tokens.length - 1 && ngrams.size < 4; i++) {
          const bi = `${tokens[i]} ${tokens[i + 1]}`;
          if (bi.split(" ").every((w) => w.length > 2)) ngrams.add(`"${bi}"`);
        }
        for (let i = 0; i < tokens.length - 2 && ngrams.size < 6; i++) {
          const tri = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
          if (tri.split(" ").every((w) => w.length > 2)) ngrams.add(`"${tri}"`);
        }
        const ctxQuoted = Array.from(ngrams);

        // Augment planned queries with context keywords to avoid missing relevant sources
        const enhancedQueries = plan.queries.map((q: string, i: number) => {
          const parts = [q];
          if (i === 0 && ctxQuoted.length > 0) {
            parts.push(ctxQuoted[0]);
          }
          if (ctxTerms.length > 0) {
            parts.push(ctxTerms.slice(0, 3).join(" "));
          }
          return parts.join(" ");
        });

        // Execute all search queries and aggregate results
        const allResults = await Promise.all(
          enhancedQueries.map((query: string) =>
            ctx.runAction(api.search.searchWeb, { query, maxResults: 5 }),
          ),
        );
        for (const r of allResults) {
          if (r.results && r.results.length > 0) {
            aggregated.push(...r.results);
          }
        }
      }

      // 5. Build system prompt with context and search results
      const systemPrompt = buildSystemPrompt({
        context: secureContext.summary,
        searchResults: aggregated.slice(0, 5), // Top 5 results
        enhancedInstructions: enhancements.enhancedSystemPrompt || "",
      });

      // Add search results info to reasoning
      if (aggregated.length > 0) {
        accumulatedReasoning += `\nFound ${aggregated.length} search results. Using top ${Math.min(5, aggregated.length)} for context.\n`;
      }

      // 6. Start streaming generation
      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: "Generating response...",
        reasoning:
          accumulatedReasoning +
          "\nGenerating response based on search results and context...",
      });

      // Stream the response using OpenRouter
      await streamResponseToMessage({
        ctx,
        messageId: args.assistantMessageId,
        systemPrompt,
        userMessage: enhancedUserMessage,
        searchResults: aggregated,
        model: "anthropic/claude-3.5-sonnet",
        existingReasoning: accumulatedReasoning,
      });
    } catch (error) {
      console.error("Generation step failed:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        chatId: args.chatId,
        assistantMessageId: args.assistantMessageId,
        timestamp: new Date().toISOString(),
      });

      // Provide more specific error message
      const errorMessage =
        error instanceof Error
          ? `I apologize, but I encountered an error while generating a response: ${error.message}. Please try again.`
          : "I apologize, but I encountered an error while generating a response. Please try again.";

      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        content: errorMessage,
        isStreaming: false,
      });
    }

    return null;
  },
});

/**
 * Build system prompt with context and search results
 */
function buildSystemPrompt(args: {
  context: string;
  searchResults: Array<{ title: string; url: string; snippet: string }>;
  enhancedInstructions: string;
}): string {
  const { context, searchResults, enhancedInstructions } = args;

  let prompt = `You are a helpful AI assistant powered by SearchAI.io.\n\n`;

  // Add context if available
  if (context) {
    prompt += `## Conversation Context\n${context}\n\n`;
  }

  // Add search results if available
  if (searchResults && searchResults.length > 0) {
    prompt += `## Search Results\n`;
    searchResults.forEach((result, i) => {
      prompt += `${i + 1}. **${result.title}**\n`;
      prompt += `   URL: ${result.url}\n`;
      prompt += `   ${result.snippet}\n\n`;
    });
  }

  // Add any enhanced instructions
  if (enhancedInstructions) {
    prompt += `\n## Additional Instructions\n${enhancedInstructions}\n`;
  }

  prompt += `\nPlease provide a helpful, accurate response based on the context and search results above.`;

  return prompt;
}

/**
 * Stream AI response to a message using OpenRouter
 */
async function streamResponseToMessage(args: {
  ctx: ActionCtx;
  messageId: Id<"messages">;
  systemPrompt: string;
  userMessage: string;
  searchResults: Array<{
    title: string;
    url: string;
    snippet: string;
    relevanceScore: number;
  }>;
  model: string;
  existingReasoning?: string;
}) {
  const {
    ctx,
    messageId,
    systemPrompt,
    userMessage,
    searchResults,
    model,
    existingReasoning = "",
  } = args;

  console.info("🚀 Starting AI response streaming:", {
    messageId,
    model,
    searchResultsCount: searchResults.length,
    userMessageLength: userMessage.length,
    systemPromptLength: systemPrompt.length,
    timestamp: new Date().toISOString(),
  });

  // Prepare messages for OpenRouter
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  // Configure OpenRouter request
  const body = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
  };

  let accumulatedContent = "";
  let lastUpdateTime = Date.now();
  const updateInterval = 100; // Update every 100ms
  let chunkCount = 0;

  try {
    console.info("📡 Starting OpenRouter stream...");

    // Stream from OpenRouter
    for await (const chunk of streamOpenRouter(body)) {
      chunkCount++;

      if (chunk.choices?.[0]?.delta?.content) {
        const newContent = chunk.choices[0].delta.content;
        accumulatedContent += newContent;

        // Log first few chunks for debugging
        if (chunkCount <= 3) {
          console.info(`📦 Chunk ${chunkCount} received:`, {
            contentLength: newContent.length,
            totalLength: accumulatedContent.length,
          });
        }

        // Batch updates to reduce database writes
        const now = Date.now();
        if (now - lastUpdateTime >= updateInterval) {
          // Work around TS2589: Known Convex limitation with complex type inference
          // @ts-ignore - Deep type instantiation error
          const now = Date.now();
          if (now - lastUpdateTime >= updateInterval) {
            // Work around TS2589: Known Convex limitation with complex type inference
            // @ts-ignore - Deep type instantiation error
            await ctx.runMutation(internal.messages.updateMessage, {
              messageId,
              content: accumulatedContent,
              streamedContent: newContent, // Send just the new chunk for streaming
              isStreaming: true,
              thinking: "",
              // Preserve reasoning during streaming
              reasoning: existingReasoning,
            });
            lastUpdateTime = now;
          }
          lastUpdateTime = now;
        }
      }
    }

    console.info("✅ Streaming completed:", {
      totalChunks: chunkCount,
      finalContentLength: accumulatedContent.length,
    });

    // Final update with complete content, sources, and search results
    const sources = searchResults
      .map((r) => r.url)
      .filter(Boolean)
      .slice(0, 5);

    await ctx.runMutation(internal.messages.updateMessage, {
      messageId,
      content: accumulatedContent,
      isStreaming: false,
      thinking: "",
      sources,
      searchResults: searchResults.slice(0, 10), // Include the full search results for display
      // Preserve reasoning in final update
      reasoning: existingReasoning,
    });
  } catch (error) {
    console.error("Streaming failed:", error);
    throw error;
  }
}
