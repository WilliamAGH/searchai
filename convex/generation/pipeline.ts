"use node";
/**
 * Main generation pipeline orchestration
 * Coordinates search, context building, and streaming response generation
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { buildContextSummary } from "../chats/utils";
import { applyEnhancements } from "../enhancements";
import { streamOpenRouter } from "./streaming";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Check if we're in test mode - skip real API calls
const IS_TEST_MODE =
  process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";

// Configuration constant for the number of top search results to use
const TOP_RESULTS = 3 as const;

/**
 * Smart Query Enhancement System
 * Intelligently enhances search queries only when it adds value
 * Uses AI SDK v5 best practices with proper error handling and fallbacks
 */
interface SmartEnhancementOptions {
  queries: string[];
  context: string | undefined;
  userMessage: string;
  enhancements: string[];
  maxQueries: number;
}

interface EnhancedQuery {
  original: string;
  enhanced: string;
  enhancementType: "none" | "context" | "entity" | "followup";
  confidence: number;
}

/**
 * Smart query enhancement with resilience and intelligent decision making
 */
async function smartEnhanceQueries(
  options: SmartEnhancementOptions,
): Promise<string[]> {
  const { queries, context, userMessage, enhancements, maxQueries } = options;

  // Log input parameters for debugging
  console.info("🔧 SmartEnhanceQueries input:", {
    queriesCount: queries.length,
    queries: queries.slice(0, 3), // Show first 3 queries
    contextLength: context?.length || 0,
    userMessageLength: userMessage?.length || 0,
    enhancementsCount: enhancements.length,
    enhancements: enhancements.slice(0, 5), // Show first 5 enhancements
    maxQueries,
    timestamp: new Date().toISOString(),
  });

  try {
    // Early return if no context or queries
    if (!context || !queries.length) {
      return queries.slice(0, maxQueries);
    }

    const enhancedQueries: EnhancedQuery[] = [];

    for (let i = 0; i < Math.min(queries.length, maxQueries); i++) {
      const originalQuery = queries[i].trim();
      if (!originalQuery) continue;

      const enhancement = await analyzeAndEnhanceQuery({
        query: originalQuery,
        context,
        userMessage,
        enhancements,
        isPrimaryQuery: i === 0,
        queryIndex: i,
      });

      enhancedQueries.push(enhancement);
    }

    // Sort by confidence and return enhanced queries
    const finalQueries = enhancedQueries
      .sort((a, b) => b.confidence - a.confidence)
      .map((eq) => eq.enhanced)
      .filter(Boolean);

    // Log final output for debugging
    console.info("🔧 SmartEnhanceQueries output:", {
      inputQueries: queries.slice(0, 3),
      outputQueries: finalQueries.slice(0, 3),
      enhancedCount: enhancedQueries.filter(
        (eq) => eq.enhancementType !== "none",
      ).length,
      timestamp: new Date().toISOString(),
    });

    return finalQueries;
  } catch (error) {
    console.warn(
      "Smart enhancement failed, falling back to original queries:",
      error,
    );
    return queries.slice(0, maxQueries);
  }
}

/**
 * Analyze a single query and determine if/how to enhance it
 */
async function analyzeAndEnhanceQuery(options: {
  query: string;
  context: string;
  userMessage: string;
  enhancements: string[];
  isPrimaryQuery: boolean;
  queryIndex: number;
}): Promise<EnhancedQuery> {
  const { query, context, userMessage, enhancements, isPrimaryQuery } = options;

  try {
    // Base case: no enhancement
    let enhancedQuery = query;
    let enhancementType: EnhancedQuery["enhancementType"] = "none";
    let confidence = 1.0;

    // Only enhance primary queries or when it makes sense
    if (isPrimaryQuery) {
      const analysis = await analyzeQueryEnhancement(
        query,
        context,
        userMessage,
      );

      if (analysis.shouldEnhance && analysis.enhancement) {
        enhancedQuery = `${query} ${analysis.enhancement}`.trim();
        enhancementType = analysis.type;
        confidence = analysis.confidence;
      }
    }

    // Apply enhancement search terms if they're highly relevant
    if (enhancements.length > 0 && isPrimaryQuery) {
      const relevantEnhancements = filterRelevantEnhancements(
        enhancements,
        query,
        context,
      );
      if (relevantEnhancements.length > 0) {
        const beforeEnhancement = enhancedQuery;
        enhancedQuery =
          `${enhancedQuery} ${relevantEnhancements.slice(0, 2).join(" ")}`.trim();

        // Log when enhancement terms are applied
        console.info("🔧 Smart enhancement applied:", {
          originalQuery: query,
          beforeEnhancement,
          afterEnhancement: enhancedQuery,
          enhancementTerms: relevantEnhancements.slice(0, 2),
          isPrimaryQuery,
          timestamp: new Date().toISOString(),
        });

        if (enhancementType === "none") {
          enhancementType = "context";
          confidence = 0.8;
        }
      }
    }

    return {
      original: query,
      enhanced: enhancedQuery,
      enhancementType,
      confidence,
    };
  } catch (error) {
    console.warn(`Query enhancement analysis failed for "${query}":`, error);
    return {
      original: query,
      enhanced: query,
      enhancementType: "none",
      confidence: 0.5,
    };
  }
}

/**
 * Analyze whether a query should be enhanced and how
 */
async function analyzeQueryEnhancement(
  query: string,
  context: string,
  _userMessage: string,
): Promise<{
  shouldEnhance: boolean;
  enhancement?: string;
  type: EnhancedQuery["enhancementType"];
  confidence: number;
}> {
  try {
    // Detect follow-up questions that need context
    if (isFollowUpQuestion(query)) {
      const contextEntity = extractMostRelevantEntity(context, query);
      if (
        contextEntity &&
        !query.toLowerCase().includes(contextEntity.toLowerCase())
      ) {
        return {
          shouldEnhance: true,
          enhancement: contextEntity,
          type: "followup",
          confidence: 0.9,
        };
      }
    }

    // Detect queries that could benefit from context
    if (isContextDependentQuery(query)) {
      const contextEntity = extractMostRelevantEntity(context, query);
      if (contextEntity) {
        return {
          shouldEnhance: true,
          enhancement: contextEntity,
          type: "context",
          confidence: 0.7,
        };
      }
    }

    // No enhancement needed
    return {
      shouldEnhance: false,
      type: "none",
      confidence: 1.0,
    };
  } catch (error) {
    console.warn("Query enhancement analysis failed:", error);
    return {
      shouldEnhance: false,
      type: "none",
      confidence: 0.5,
    };
  }
}

/**
 * Detect if a query is a follow-up question that needs context
 */
function isFollowUpQuestion(query: string): boolean {
  const followUpPatterns = [
    /^(what|how|where|when|why)\s+about\b/i,
    /^(it|they|this|that|these|those)\s/i,
    /^(and|also|additionally)\s/i,
    /^(tell me more about|explain|describe)\b/i,
    /^(what else|anything else|other)\b/i,
  ];

  return followUpPatterns.some((pattern) => pattern.test(query));
}

/**
 * Detect if a query could benefit from additional context
 */
function isContextDependentQuery(query: string): boolean {
  // Short queries often need context
  if (query.split(/\s+/).length <= 3) return true;

  // Queries with pronouns need context
  if (/\b(it|they|this|that|these|those|here|there)\b/i.test(query))
    return true;

  // Queries that reference previous content
  if (/\b(above|previous|earlier|mentioned|said)\b/i.test(query)) return true;

  return false;
}

/**
 * Extract the most relevant entity from context for a given query
 */
function extractMostRelevantEntity(
  context: string,
  query: string,
): string | null {
  try {
    // Extract named entities (companies, people, places, technical terms)
    const entities = extractNamedEntities(context);

    if (entities.length === 0) return null;

    // Find the most relevant entity to the query
    let bestEntity = null;
    let bestScore = 0;

    for (const entity of entities) {
      const score = calculateEntityRelevance(entity, query, context);
      if (score > bestScore && score > 0.3) {
        // Minimum relevance threshold
        bestScore = score;
        bestEntity = entity;
      }
    }

    return bestEntity;
  } catch {
    return null;
  }
}

// Entity configuration for named entity extraction
const ENTITY_CONFIG = {
  companies: [
    "Apple",
    "Google",
    "Microsoft",
    "Amazon",
    "Meta",
    "Tesla",
    "OpenAI",
    "Anthropic",
    "IBM",
    "Oracle",
    "Samsung",
    "Netflix",
    "Twitter",
    "SpaceX",
    "GitHub",
    "Stack Overflow",
    "Wikipedia",
    "Reddit",
    "YouTube",
    "LinkedIn",
    "Facebook",
    "Instagram",
    "WhatsApp",
    "Discord",
    "Slack",
    "Zoom",
    "Notion",
    "Figma",
    "Framer",
    "Vercel",
    "Netlify",
    "Heroku",
    "AWS",
    "Azure",
    "GCP",
    "Cloudflare",
    "Stripe",
    "PayPal",
    "Square",
    "Shopify",
    "Magento",
    "WooCommerce",
    "WordPress",
    "Drupal",
    "Joomla",
  ],
  techTerms: [
    "headquarters",
    "HQ",
    "office",
    "campus",
    "based",
    "located",
    "founded",
    "CEO",
    "founder",
    "product",
    "service",
    "cloud",
    "AI",
    "machine learning",
    "artificial intelligence",
    "algorithm",
    "database",
    "API",
    "framework",
    "library",
    "tool",
    "platform",
    "software",
    "hardware",
    "network",
    "security",
    "privacy",
    "compliance",
    "governance",
    "risk",
    "quality",
    "testing",
    "monitoring",
    "observability",
    "logging",
    "tracing",
    "metrics",
    "alerting",
  ],
};

/**
 * Extract named entities from context text
 */
function extractNamedEntities(context: string): string[] {
  if (!context) return [];

  const entities: string[] = [];

  try {
    const { companies: companyNames, techTerms } = ENTITY_CONFIG;

    for (const company of companyNames) {
      if (context.toLowerCase().includes(company.toLowerCase())) {
        entities.push(company.toLowerCase());
      }
    }

    for (const term of techTerms) {
      if (
        context.toLowerCase().includes(term.toLowerCase()) &&
        entities.length < 8
      ) {
        entities.push(term.toLowerCase());
      }
    }

    // Remove duplicates and return most relevant entities
    return [...new Set(entities)].slice(0, 8);
  } catch (error) {
    console.warn("Named entity extraction failed:", error);
    return [];
  }
}

/**
 * Calculate how relevant an entity is to a query and context
 */
function calculateEntityRelevance(
  entity: string,
  query: string,
  context: string,
): number {
  try {
    const entityLower = entity.toLowerCase();
    const queryLower = query.toLowerCase();
    const contextLower = context.toLowerCase();

    let score = 0;

    // Entity appears in query (high relevance)
    if (queryLower.includes(entityLower)) {
      score += 0.8;
    }

    // Entity appears in context (medium relevance)
    if (contextLower.includes(entityLower)) {
      score += 0.4;
    }

    // Entity is semantically related to query terms
    const queryWords = queryLower.split(/\s+/);
    const entityWords = entityLower.split(/\s+/);

    for (const queryWord of queryWords) {
      for (const entityWord of entityWords) {
        if (queryWord.length > 2 && entityWord.length > 2) {
          // Exact match
          if (queryWord === entityWord) {
            score += 0.6;
          }
          // Partial match
          else if (
            queryWord.includes(entityWord) ||
            entityWord.includes(queryWord)
          ) {
            score += 0.3;
          }
          // Similar words (basic similarity)
          else if (calculateWordSimilarity(queryWord, entityWord) > 0.7) {
            score += 0.2;
          }
        }
      }
    }

    // Normalize score to 0-1 range
    return Math.min(1.0, Math.max(0.0, score));
  } catch (error) {
    console.warn("Entity relevance calculation failed:", error);
    return 0.0;
  }
}

/**
 * Calculate basic word similarity (simple implementation)
 */
function calculateWordSimilarity(word1: string, word2: string): number {
  try {
    if (word1 === word2) return 1.0;
    if (word1.length < 3 || word2.length < 3) return 0.0;

    // Simple character-based similarity
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;

    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) {
        matches++;
      }
    }

    return matches / longer.length;
  } catch {
    return 0.0;
  }
}

/**
 * Filter enhancement terms to only include highly relevant ones
 */
function filterRelevantEnhancements(
  enhancements: string[],
  query: string,
  context: string,
): string[] {
  try {
    if (!enhancements.length) return [];

    const relevantEnhancements: string[] = [];
    const queryLower = query.toLowerCase();
    const contextLower = context.toLowerCase();

    for (const enhancement of enhancements) {
      const enhancementLower = enhancement.toLowerCase();

      // Skip if enhancement is already in query
      if (queryLower.includes(enhancementLower)) continue;

      // Skip if enhancement is too generic
      if (enhancementLower.length < 3) continue;

      // Check if enhancement is relevant to context
      if (contextLower.includes(enhancementLower)) {
        relevantEnhancements.push(enhancement);
      }
    }

    return relevantEnhancements.slice(0, 3); // Limit to top 3
  } catch (error) {
    console.warn("Enhancement filtering failed:", error);
    return [];
  }
}

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

      // Watchdog: if streaming hasn't started shortly, trigger direct execution as fallback
      await ctx.scheduler.runAfter(750, internal.ai.watchdogEnsureGeneration, {
        chatId: args.chatId,
        assistantMessageId,
        userMessage: trimmed,
      });

      console.info("✅ Generation step scheduled successfully (with watchdog)");
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
 * - Streams response with 25ms batching
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
    // Guard: if this message already started streaming, skip duplicate run
    try {
      const current = await ctx.runQuery(api.chats.subscribeToMessageStream, {
        messageId: args.assistantMessageId,
      });
      if (
        current &&
        (current.streamedContent || current.thinking || current.content)
      ) {
        console.info(
          "⏭️ Generation already appears to be underway, skipping duplicate run",
          {
            messageId: args.assistantMessageId,
          },
        );
        return null;
      }
    } catch {}
    console.info("🔥 Generation step started:", {
      chatId: args.chatId,
      assistantMessageId: args.assistantMessageId,
      userMessageLength: args.userMessage.length,
      timestamp: new Date().toISOString(),
    });

    // TEST MODE: Return mock response without hitting real APIs
    if (IS_TEST_MODE) {
      console.log("[TEST MODE] Generating mock AI response");

      // Update message with mock content
      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        content: `This is a test response for "${args.userMessage}". In test mode, we don't make real API calls.`,
        isStreaming: false,
      });

      return null;
    }

    // 1. Build secure context FIRST and check if rolling summary needs update
    // Get messages via query since we're in an action context
    const messages = await ctx.runQuery(api.chats.getChatMessages, {
      chatId: args.chatId,
    });
    const chat = await ctx.runQuery(api.chats.getChatById, {
      chatId: args.chatId,
    });

    // Build context from messages - use the sophisticated version from chats/utils
    const contextSummary = buildContextSummary({
      messages: messages.slice(-50).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      rollingSummary: chat?.rollingSummary,
      maxChars: 1600,
    });
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
      // Only show detailed search planning in development mode
      const isDevelopment = process.env.NODE_ENV === "development";
      let accumulatedReasoning = isDevelopment ? "Planning search...\n" : "";

      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: "Planning search",
        reasoning: accumulatedReasoning,
      });

      const plan = await ctx.runAction(api.search.planSearch, {
        chatId: args.chatId,
        newMessage: enhancedUserMessage,
        maxContextMessages: 10,
      });

      // Add search planning results to reasoning only in development mode
      if (isDevelopment) {
        accumulatedReasoning += plan.shouldSearch
          ? `\nSearching the web with ${plan.queries.length} queries:\n${plan.queries.map((q: string, i: number) => `  ${i + 1}. ${q}`).join("\n")}\n\nReason: ${plan.reasons}\n`
          : `\nNo search needed. Reason: ${plan.reasons}\n`;
      }

      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: plan.shouldSearch
          ? `Searching the web (queries: ${plan.queries.length})`
          : "Analyzing without search",
        reasoning: accumulatedReasoning,
      });

      let aggregated: Array<{
        title: string;
        url: string;
        snippet: string;
        relevanceScore: number;
      }> = [];
      if (plan.shouldSearch) {
        // SMART QUERY ENHANCEMENT: Only enhance when it adds value
        // Use the sophisticated context from planSearch instead of rebuilding
        const planContextSummary = plan.contextSummary;

        // SAFETY SWITCH: Temporarily disable smart enhancement if needed
        const DISABLE_SMART_ENHANCEMENT =
          process.env.DISABLE_SMART_ENHANCEMENT === "true";

        let enhancedQueries: string[];
        if (DISABLE_SMART_ENHANCEMENT) {
          console.warn(
            "🚨 Smart query enhancement DISABLED - using original queries only",
          );
          enhancedQueries = plan.queries.slice(0, TOP_RESULTS);
        } else {
          // Smart query enhancement with resilience and fallbacks
          enhancedQueries = await smartEnhanceQueries({
            queries: plan.queries,
            context: planContextSummary,
            userMessage: args.userMessage,
            enhancements: enhancements.enhancedSearchTerms,
            maxQueries: TOP_RESULTS,
          });
        }

        // Execute only the top enhanced queries and aggregate results
        const queriesToRun = enhancedQueries.slice(0, TOP_RESULTS);

        // Log the queries being executed for debugging (development only)
        if (isDevelopment) {
          console.info("🔍 Executing search queries:", {
            original: plan.queries.slice(0, 3),
            enhanced: queriesToRun,
            contextLength: planContextSummary?.length || 0,
          });
        }

        // Execute searches with proper error handling and retries
        const allResults = await Promise.allSettled(
          queriesToRun.map(async (query, index) => {
            try {
              // Add small delay between queries to avoid rate limiting
              if (index > 0) {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }

              return await ctx.runAction(api.search.searchWeb, {
                query: query.trim(),
                maxResults: 5,
              });
            } catch (error) {
              console.warn(`Search query failed for "${query}":`, error);
              return {
                results: [],
                searchMethod: "fallback" as const,
                hasRealResults: false,
              };
            }
          }),
        );

        // Aggregate successful results with proper error handling
        for (const result of allResults) {
          if (
            result.status === "fulfilled" &&
            result.value.results &&
            result.value.results.length > 0
          ) {
            aggregated.push(...result.value.results);
          }
        }

        // Add injected results from enhancement system (e.g., creator info)
        if (
          enhancements.injectedResults &&
          enhancements.injectedResults.length > 0
        ) {
          // Add injected results at the beginning for higher priority
          aggregated.unshift(...enhancements.injectedResults);
        }

        // Fallback: if no results from enhanced queries, try original queries
        if (aggregated.length === 0 && plan.queries.length > 0) {
          console.warn(
            "No results from enhanced queries, falling back to original queries",
          );
          try {
            const fallbackResult = await ctx.runAction(api.search.searchWeb, {
              query: plan.queries[0],
              maxResults: 5,
            });
            if (fallbackResult.results && fallbackResult.results.length > 0) {
              aggregated.push(...fallbackResult.results);
            }
          } catch (fallbackError) {
            console.error("Fallback search also failed:", fallbackError);
          }
        }

        // Deduplicate by normalized URL and sort by relevance
        const deduped: typeof aggregated = [];
        const seen = new Set<string>();
        for (const item of aggregated) {
          try {
            const u = new URL(item.url);
            const key = (u.origin + u.pathname)
              .toLowerCase()
              .replace(/\/+$/, "");
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
          } catch {
            deduped.push(item);
          }
        }
        aggregated = deduped.sort(
          (a, b) => b.relevanceScore - a.relevanceScore,
        );
      }

      // 5. Build system prompt with context and search results
      // CRITICAL FIX: Use the sophisticated context from planSearch instead of rebuilding
      const systemPrompt = buildSystemPrompt({
        context: plan.contextSummary, // Use the good context from planSearch!
        searchResults: aggregated.slice(0, TOP_RESULTS), // Top results
        enhancedInstructions: enhancements.enhancedSystemPrompt || "",
      });

      // Add search results info to reasoning only in development mode
      if (isDevelopment && aggregated.length > 0) {
        accumulatedReasoning += `\nFound ${aggregated.length} search results. Using top ${Math.min(TOP_RESULTS, aggregated.length)} for context.\n\nProcessing search results:\n`;
        
        // Show scraping progress for each result
        for (let i = 0; i < Math.min(TOP_RESULTS, aggregated.length); i++) {
          const result = aggregated[i];
          // Extract domain for display
          let domain = "";
          try {
            const url = new URL(result.url);
            domain = url.hostname.replace("www.", "");
          } catch {
            domain = "source";
          }
          accumulatedReasoning += `  ${i + 1}. [${domain}] ${result.title}\n`;
          if (result.snippet) {
            accumulatedReasoning += `     → Extracting: "${result.snippet.substring(0, 80)}..."\n`;
          }
        }
        accumulatedReasoning += `\nContext synthesis complete. Building response...\n`;
      }

      // 6. Start streaming generation
      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: "Generating response",
        reasoning: isDevelopment
          ? accumulatedReasoning +
            "\nGenerating response based on search results and context"
          : accumulatedReasoning, // In production, reasoning is empty until LLM starts
      });

      // Stream the response using OpenRouter
      // Note: Gemini models support reasoning parameters for enhanced responses
      await streamResponseToMessage({
        ctx,
        messageId: args.assistantMessageId,
        systemPrompt,
        userMessage: enhancedUserMessage,
        searchResults: aggregated,
        model: "google/gemini-2.5-flash",
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
 * Watchdog: Ensure generation begins
 * - If streaming hasn't started soon after scheduling, trigger direct execution
 */
export const watchdogEnsureGeneration = internalAction({
  args: {
    chatId: v.id("chats"),
    assistantMessageId: v.id("messages"),
    userMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const state = await ctx.runQuery(api.chats.subscribeToMessageStream, {
        messageId: args.assistantMessageId,
      } as any);

      const alreadyStreaming = state?.isStreaming === true;
      if (alreadyStreaming) {
        console.info(
          "🛡️ Watchdog: Streaming already in progress, nothing to do.",
          {
            messageId: args.assistantMessageId,
          },
        );
        return null;
      }

      console.warn(
        "🛡️ Watchdog: Streaming not started, invoking generation directly",
        { messageId: args.assistantMessageId },
      );

      await ctx.runAction(internal.ai.generationStep, {
        chatId: args.chatId,
        assistantMessageId: args.assistantMessageId,
        userMessage: args.userMessage,
      });
    } catch (error) {
      console.error("Watchdog failed to ensure generation:", error);
    }
    return null;
  },
});

/**
 * Build system prompt with context and search results
 */
function buildSystemPrompt(args: {
  context: string;
  searchResults: Array<{ 
    title: string; 
    url: string; 
    snippet: string;
    content?: string;
    fullTitle?: string;
    summary?: string;
  }>;
  enhancedInstructions: string;
}): string {
  const { context, searchResults, enhancedInstructions } = args;

  let prompt = `You are SearchAI, a knowledgeable and confident search assistant powered by SearchAI.io. You provide accurate, comprehensive answers based on search results and available information. You speak with authority when the information is clear, and transparently acknowledge limitations only when truly uncertain. Your goal is to be maximally helpful while maintaining accuracy.\n\n`;

  // Add context if available
  if (context) {
    prompt += `## Conversation Context\n${context}\n\n`;
  }

  // Add search results if available - INCLUDING SCRAPED CONTENT
  if (searchResults && searchResults.length > 0) {
    prompt += `## Search Results with Full Content\n`;
    searchResults.forEach((result, i) => {
      // Extract domain for citation reference
      let domain = "";
      try {
        const url = new URL(result.url);
        domain = url.hostname.replace("www.", "");
      } catch {
        const match = result.url.match(/(?:https?:\/\/)?(?:www\.)?([^/:]+)/i);
        domain = match ? match[1] : "source";
      }
      
      prompt += `${i + 1}. **${result.fullTitle || result.title}** [${domain}]\n`;
      prompt += `   URL: ${result.url}\n`;
      
      // CRITICAL FIX: Include scraped content when available
      if (result.content) {
        // Limit content to prevent context overflow (2000 chars per result)
        const maxContentLength = 2000;
        const truncatedContent = result.content.length > maxContentLength
          ? result.content.slice(0, maxContentLength) + "..."
          : result.content;
        prompt += `   Full Content: ${truncatedContent}\n\n`;
      } else if (result.summary) {
        prompt += `   Summary: ${result.summary}\n\n`;
      } else {
        prompt += `   Snippet: ${result.snippet}\n\n`;
      }
    });
  }

  // Add any enhanced instructions
  if (enhancedInstructions) {
    prompt += `\n## Additional Instructions\n${enhancedInstructions}\n`;
  }

  prompt += `\nProvide a comprehensive, detailed, and authoritative response based on the context and search results above. Be thorough in your explanations, offering multiple perspectives and examples where relevant. Include specific details, steps, and context that would be helpful. Be confident in presenting information you have, while being transparent about any uncertainties. Aim for depth and completeness in your response to maximize helpfulness to the user.`;

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
    content?: string;
    fullTitle?: string;
    summary?: string;
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
    temperature: 0.8, // Increased from 0.7 for more creative/verbose responses
    max_tokens: 4000, // Increased from 2000 to allow longer responses
    stream: true,
    top_p: 0.95, // Slightly wider nucleus sampling for more variety
    frequency_penalty: -0.2, // Negative value encourages some repetition (more verbose)
    presence_penalty: 0.1, // Slight penalty for new topics to stay focused
    // For thinking models, control reasoning verbosity
    // NOTE: OpenRouter only accepts ONE of reasoning.effort or max_tokens, not both
    // Currently using max_tokens for google/gemini-2.5-flash (non-thinking model)
  };

  let accumulatedContent = "";
  let accumulatedReasoning = existingReasoning || "";
  let lastUpdateTime = Date.now();
  // FIXED: Reduce update interval for more responsive streaming
  // 25ms provides smoother streaming while maintaining reasonable database load
  const updateInterval = 25; // Was 50ms - reduced for better streaming responsiveness
  let chunkCount = 0;
  let updateInFlight = false;

  try {
    console.info("📡 Starting OpenRouter stream...");

    // Stream from OpenRouter
    for await (const chunk of streamOpenRouter(body, {
      apiKey: process.env.OPENROUTER_API_KEY || "",
      siteUrl: process.env.SITE_URL || undefined,
      siteTitle: process.env.SITE_TITLE || undefined,
      debug: process.env.DEBUG_OPENROUTER === "1",
    })) {
      chunkCount++;

      // Handle reasoning/thinking content from models that support it
      if (chunk.choices?.[0]?.delta?.reasoning) {
        const newReasoning = chunk.choices[0].delta.reasoning;
        accumulatedReasoning += newReasoning;
      }

      if (chunk.choices?.[0]?.delta?.content) {
        const newContent = chunk.choices[0].delta.content;

        // Don't add any text to reasoning when starting content streaming
        // The UI handles the thinking/streaming status display
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
        if (!updateInFlight && now - lastUpdateTime >= updateInterval) {
          updateInFlight = true;
          // FIXED: Proper streaming implementation
          // - content: accumulated content (for final display)
          // - streamedContent: new chunk (for incremental updates)
          // - isStreaming: true (to indicate streaming state)
          const _ret: null = await ctx.runMutation(
            internal.messages.updateMessage,
            {
              messageId,
              content: accumulatedContent,
              streamedContent: newContent, // Send just the new chunk for streaming
              isStreaming: true,
              thinking: "Composing response",
              // Stream the accumulated reasoning
              reasoning: accumulatedReasoning,
            },
          );
          lastUpdateTime = now;
          updateInFlight = false;
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
      .slice(0, TOP_RESULTS);

    await ctx.runMutation(internal.messages.updateMessage, {
      messageId,
      content: accumulatedContent,
      isStreaming: false,
      thinking: "",
      sources,
      searchResults: searchResults.slice(0, TOP_RESULTS), // Align with top sources
      // Final reasoning content
      reasoning: accumulatedReasoning,
    });
  } catch (error) {
    console.error("Streaming failed:", error);
    throw error;
  }
}
