"use node";
/**
 * AI generation pipeline
 * - Appends user msg, creates assistant placeholder, streams model output
 * - Plans context-aware search, scrapes top sources, builds system prompt
 * - Streams chunks safely with batched DB updates
 */

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { buildContextSummary } from "./chats";
import { applyEnhancements, sortResultsWithPriority } from "./enhancements";

// Normalize URLs for stable deduplication and deterministic ranking
function normalizeUrlForKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    // Strip common tracking params
    const paramsToStrip = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "ref",
    ];
    paramsToStrip.forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

interface OpenRouterMessage {
  role: string;
  content: string;
  cache_control?: { type: string };
}

interface OpenRouterBody {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_tokens: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

/**
 * Stream chunks from OpenRouter API
 * - Yields parsed SSE JSON payloads
 * - Handles [DONE] signal
 * - Detailed error logging
 * - Throws on HTTP/parsing errors
 * @param body - OpenRouter API request body
 * @yields Parsed JSON chunks from stream
 */
async function* streamOpenRouter(body: OpenRouterBody) {
  if (process.env.DEBUG_OPENROUTER)
    console.info("🔄 OpenRouter streaming request initiated:", {
      model: body.model,
      messageCount: body.messages.length,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY; cannot call OpenRouter.");
    }
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(process.env.SITE_URL
            ? { "HTTP-Referer": process.env.SITE_URL }
            : {}),
          ...(process.env.SITE_TITLE
            ? { "X-Title": process.env.SITE_TITLE }
            : {}),
        },
        body: JSON.stringify({ ...body, stream: true }),
      },
    );

    if (process.env.DEBUG_OPENROUTER)
      console.info("📊 OpenRouter response received:", {
        status: response.status,
        statusText: response.statusText,
        hasBody: !!response.body,
      });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`;
      console.error("❌ OpenRouter API error details:", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText,
        url: "https://openrouter.ai/api/v1/chat/completions",
      });
      throw new Error(errorMessage);
    }

    if (!response.body) {
      const errorMessage = "OpenRouter API returned no response body";
      console.error("❌ OpenRouter API no body error");
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;

    if (process.env.DEBUG_OPENROUTER)
      console.info("✅ OpenRouter streaming started successfully");

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush remaining decoder state and process leftover buffer
          buffer += decoder.decode(new Uint8Array(0), { stream: false });
          const lines = buffer.split(/\r?\n/);
          buffer = "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                console.info("✅ OpenRouter streaming finished with [DONE]");
                return;
              }
              try {
                chunkCount++;
                const parsedData = JSON.parse(data);
                yield parsedData;
              } catch (e) {
                if (process.env.DEBUG_OPENROUTER)
                  console.error("❌ Failed to parse stream chunk at EOF:", {
                    error:
                      e instanceof Error ? e.message : "Unknown parsing error",
                    chunk: data,
                    chunkNumber: chunkCount,
                  });
              }
            }
          }
          if (process.env.DEBUG_OPENROUTER)
            console.info("🔄 OpenRouter streaming completed:", {
              totalChunks: chunkCount,
            });
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              if (process.env.DEBUG_OPENROUTER)
                console.info("✅ OpenRouter streaming finished with [DONE]");
              return;
            }
            try {
              chunkCount++;
              const parsedData = JSON.parse(data);
              yield parsedData;
            } catch (e) {
              if (process.env.DEBUG_OPENROUTER)
                console.error("❌ Failed to parse stream chunk:", {
                  error:
                    e instanceof Error ? e.message : "Unknown parsing error",
                  chunk: data,
                  chunkNumber: chunkCount,
                });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error("💥 OpenRouter streaming failed with exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      timestamp: new Date().toISOString(),
    });
    throw error;
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Ignore empty or whitespace-only input
    const trimmed = args.message.trim();
    if (!trimmed) {
      return null;
    }
    // 1. Add user message to chat
    await ctx.runMutation(internal.messages.addMessage, {
      chatId: args.chatId,
      role: "user",
      content: trimmed,
    });

    // 2. Create a placeholder message for the assistant's response
    const assistantMessageId = await ctx.runMutation(
      internal.messages.addMessage,
      {
        chatId: args.chatId,
        role: "assistant",
        content: "",
        isStreaming: true,
      },
    );

    // 3. Start the generation process without blocking
    await ctx.scheduler.runAfter(0, internal.ai.generationStep, {
      chatId: args.chatId,
      assistantMessageId,
      userMessage: trimmed,
    });
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
    let searchResults: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore?: number;
    }> = [];
    let searchContext = "";
    const _sources: string[] = [];
    let hasRealResults = false;
    let searchMethod: "serp" | "openrouter" | "duckduckgo" | "fallback" =
      "fallback";
    const errorDetails: string[] = [];

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
    const prioritizedUrls = enhancements.prioritizedUrls;
    const injectedResults = enhancements.injectedResults;
    const enhancedSystemPromptAddition = enhancements.enhancedSystemPrompt;

    try {
      // 4. Plan and perform context-aware web search
      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: "Planning search...",
      });

      const plan = await ctx.runAction(api.search.planSearch, {
        chatId: args.chatId,
        newMessage: enhancedUserMessage,
        maxContextMessages: 10,
      });

      await ctx.runMutation(internal.messages.updateMessage, {
        messageId: args.assistantMessageId,
        thinking: plan.shouldSearch
          ? `Searching the web (queries: ${plan.queries.length})...`
          : "Analyzing without search...",
      });

      let aggregated: Array<{
        title: string;
        url: string;
        snippet: string;
        relevanceScore?: number;
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
        const freshSummary = buildContextSummary({
          messages: allMsgs,
          maxChars: 1200,
        });
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
        const enrich = (q: string) => {
          const base = (q || "").trim();
          const missing: string[] = [];
          const present = new Set(
            base
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter(Boolean),
          );
          for (const t of ctxTerms) {
            if (!present.has(t) && missing.length < 4) missing.push(t);
          }
          // Add up to 2 quoted phrases when available
          const phrases = Array.from(ngrams).slice(0, 2);
          const suffix = [missing.join(" "), phrases.join(" ")]
            .filter(Boolean)
            .join(" ")
            .trim();
          return suffix ? `${base} ${suffix}` : base;
        };
        const currentYear = new Date().getFullYear();
        const recencyCue = `${currentYear}`;
        for (const q of plan.queries) {
          // Add minimal operator hints for obvious intents (docs/GitHub/latest)
          let enriched = enrich(q).slice(0, 240);
          const lower = enriched.toLowerCase();
          if (/sdk|api|reference|docs/.test(lower) && !/site:/.test(lower)) {
            enriched += " site:docs.*";
          } else if (
            /github|repo|source code|library/.test(lower) &&
            !/site:/.test(lower)
          ) {
            enriched += " site:github.com";
          }
          if (
            /whitepaper|paper|report|pdf/.test(lower) &&
            !/filetype:pdf/.test(lower)
          ) {
            enriched += " filetype:pdf";
          }
          if (/latest|current|202[4-9]/.test(lower) === false) {
            enriched += ` ${recencyCue}`;
          }
          const res = await ctx.runAction(api.search.searchWeb, {
            query: enriched,
            maxResults: 5,
          });
          const results = res.results || [];
          // Track last successful method for display
          if (results.length > 0) {
            searchMethod = res.searchMethod as
              | "serp"
              | "openrouter"
              | "duckduckgo"
              | "fallback";
          }
          aggregated = aggregated.concat(results);
          hasRealResults = hasRealResults || !!res.hasRealResults;
        }

        // Inject any enhancement results
        if (injectedResults.length > 0) {
          // Add injected results at the beginning
          aggregated.unshift(...injectedResults);
          hasRealResults = true;
        }

        // Dedupe by URL (normalized), keep highest relevance
        const byUrl = new Map<
          string,
          {
            title: string;
            url: string;
            snippet: string;
            relevanceScore: number;
          }
        >();
        for (const r of aggregated) {
          const key = normalizeUrlForKey(r.url);
          const existing = byUrl.get(key);
          const score =
            typeof r.relevanceScore === "number" ? r.relevanceScore : 0.5;
          if (!existing || score > existing.relevanceScore) {
            byUrl.set(key, {
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              relevanceScore: score,
            });
          }
        }
        // Lightweight rerank: prioritize overlap with latest user message + quoted phrases
        const latest = (args.userMessage || "").toLowerCase();
        const phraseSet = new Set(Array.from(ngrams));
        const score = (r: {
          title: string;
          snippet: string;
          url: string;
          relevanceScore: number;
        }) => {
          const text = `${r.title} ${r.snippet}`.toLowerCase();
          let s = r.relevanceScore || 0.5;
          // Overlap with latest question tokens
          const latestTokens = new Set(
            latest.split(/[^a-z0-9]+/).filter(Boolean),
          );
          let overlap = 0;
          for (const t of latestTokens)
            if (t.length > 2 && text.includes(t)) overlap++;
          s += Math.min(0.3, overlap * 0.03);
          // Phrase match bonus
          for (const p of phraseSet)
            if (p && text.includes((p as string).replace(/"/g, ""))) s += 0.1;
          // Domain whitelist/blacklist: boost official docs, downweight content farms
          try {
            const host = new URL(r.url).hostname;
            if (/docs\.|developer\.|learn\.|support\.|dev\./.test(host))
              s += 0.12;
            if (/\.gov$|\.edu$/.test(host)) s += 0.1;
            if (
              /medium\.com$|quora\.com$|pinterest\.com$|slideshare\.net$/.test(
                host,
              )
            )
              s -= 0.15;
            if (/reddit\.com$|news\.ycombinator\.com$/.test(host)) s -= 0.05; // reduce chatter
          } catch {}
          return s;
        };
        searchResults = Array.from(byUrl.values())
          .map((r) => ({ ...r, relevanceScore: score(r) }))
          .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
          .slice(0, 7);

        await ctx.runMutation(internal.messages.updateMessage, {
          messageId: args.assistantMessageId,
          thinking: `Found ${searchResults.length} results. Parsing content...`,
          searchResults,
          searchMethod,
          hasRealResults,
        });

        if (searchResults.length > 0) {
          // 5. Scrape content from top results
          // Prioritize URLs based on enhancement rules
          let resultsToScrape = searchResults;
          if (prioritizedUrls.length > 0) {
            // Sort results with prioritized URLs first
            resultsToScrape = sortResultsWithPriority(
              searchResults,
              prioritizedUrls,
            );
          }
          resultsToScrape = resultsToScrape.slice(0, 3);

          // Deterministic source ordering independent of scrape resolution time
          const deterministicSources = resultsToScrape.map((r) => r.url);
          const contentPromises = resultsToScrape.map(
            async (result: { url: string; title: string; snippet: string }) => {
              try {
                const content = await ctx.runAction(api.search.scrapeUrl, {
                  url: result.url,
                });
                return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
              } catch (error) {
                errorDetails.push(
                  `Failed to scrape ${result.url}: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
                return `Source: ${result.title} (${result.url})\n${result.snippet}`;
              }
            },
          );
          const contents = await Promise.all(contentPromises);
          // Include planner summary at the top and the latest user message explicitly
          const enhancedCtx = enhancements.enhancedContext
            ? `\n${enhancements.enhancedContext}`
            : "";
          const recentContext = plan.contextSummary
            ? `Conversation context:\n${plan.contextSummary}${enhancedCtx}\n\n`
            : enhancements.enhancedContext
              ? `Conversation context:\n${enhancements.enhancedContext}\n\n`
              : "";
          const latest = args.userMessage
            ? `Latest question:\n${args.userMessage}\n\n`
            : "";
          searchContext = `${recentContext}${latest}${contents.join("\n\n")}`;

          await ctx.runMutation(internal.messages.updateMessage, {
            messageId: args.assistantMessageId,
            sources: deterministicSources,
          });
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
      errorDetails.push(
        `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // 6. Fetch chat history for context - include recent messages only
    const messages: Array<{
      _id: import("./_generated/dataModel").Id<"messages">;
      role: "user" | "assistant" | "system";
      content?: string;
    }> = await ctx.runQuery(api.chats.getChatMessages, {
      chatId: args.chatId,
    });
    // Build capped message history, excluding the current assistant message being generated
    const MAX_HISTORY = 18; // cap to last ~9 user/assistant turns
    const messageHistory = messages
      .filter((m) => m._id !== args.assistantMessageId)
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role,
        content: m.content || "",
      }));

    // 7. Generate AI response with streaming
    await ctx.runMutation(internal.messages.updateMessage, {
      messageId: args.assistantMessageId,
      thinking: "Generating response...",
    });

    // Build comprehensive system prompt with ALL context
    let systemPrompt = `You are a helpful AI assistant. `;

    // Add any enhancement-specific system prompt additions
    if (enhancedSystemPromptAddition) {
      systemPrompt += enhancedSystemPromptAddition + "\n\n";
    }

    if (hasRealResults && searchContext) {
      systemPrompt += `Use the following search results to inform your response. Cite sources naturally when relevant. IMPORTANT: When citing sources inline, use the domain name in brackets like [example.com] immediately after the relevant claim.\n\n`;
      systemPrompt += `## Conversation + Results Context\n${searchContext}\n\n`;
      systemPrompt += `## Search Metadata:\n`;
      searchResults
        .slice(0, 5)
        .forEach(
          (
            result: { title: string; url: string; snippet: string },
            idx: number,
          ) => {
            const snippet = (result.snippet || "").slice(0, 240);
            systemPrompt += `${idx + 1}. ${result.title}\n   URL: ${result.url}\n   Snippet: ${snippet}${snippet.length === 240 ? "..." : ""}\n\n`;
          },
        );
    } else if (!hasRealResults && searchResults.length > 0) {
      systemPrompt += `Limited search results available. Use what's available and supplement with your knowledge. IMPORTANT: When citing sources inline, use the domain name in brackets like [example.com] immediately after the relevant claim.\n\n`;
      systemPrompt += `## Available Results:\n`;
      searchResults.forEach((result: { title: string; snippet: string }) => {
        systemPrompt += `- ${result.title}: ${result.snippet}\n`;
      });
    } else {
      // Include conversation summary and latest message even if search failed
      const noSearchCtx = searchContext ? `\n\nContext:\n${searchContext}` : "";
      systemPrompt = `You are a helpful AI assistant. Web search was not successful. Provide helpful responses based on your knowledge.${noSearchCtx}`;
    }

    systemPrompt += `\n\nProvide clear, helpful responses. Always format output using strict GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language tags. Avoid arbitrary HTML beyond <u>. This is a continued conversation, so consider the full context of previous messages.`;

    const openRouterBody = {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: systemPrompt,
          // Enable caching for the system prompt with search context
          cache_control:
            searchContext.length > 1000 ? { type: "ephemeral" } : undefined,
        },
        ...messageHistory,
      ],
      temperature: 0.7,
      max_tokens: 4000,
      // Enable streaming and caching optimizations
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    let responseContent = "";
    let hasStartedContent = false;
    let updateBuffer = "";
    let lastUpdateTime = Date.now();
    const UPDATE_INTERVAL_MS = 100; // Batch updates every 100ms to avoid race conditions

    try {
      // Support both delta streaming and full-message frames
      let lastFullContentLen = 0;
      for await (const chunk of streamOpenRouter(openRouterBody)) {
        const deltaContent = chunk?.choices?.[0]?.delta?.content as
          | string
          | undefined;
        const fullContent = chunk?.choices?.[0]?.message?.content as
          | string
          | undefined;
        let appended = "";
        if (typeof deltaContent === "string" && deltaContent.length > 0) {
          appended = deltaContent;
        } else if (typeof fullContent === "string" && fullContent.length > 0) {
          if (fullContent.length > lastFullContentLen) {
            appended = fullContent.slice(lastFullContentLen);
            lastFullContentLen = fullContent.length;
          }
        }
        if (!appended) continue;

        responseContent += appended;
        updateBuffer += appended;

        const now = Date.now();
        const shouldUpdate =
          now - lastUpdateTime >= UPDATE_INTERVAL_MS || !hasStartedContent;

        if (shouldUpdate && updateBuffer) {
          try {
            if (!hasStartedContent) {
              hasStartedContent = true;
              await ctx.runMutation(internal.messages.updateMessage, {
                messageId: args.assistantMessageId,
                streamedContent: responseContent,
                hasStartedContent: true,
              });
            } else {
              await ctx.runMutation(internal.messages.updateMessage, {
                messageId: args.assistantMessageId,
                streamedContent: responseContent,
              });
            }
            updateBuffer = "";
            lastUpdateTime = now;
          } catch (mutationError) {
            console.error(
              "Failed to update message during streaming:",
              mutationError,
            );
          }
        }
      }

      // Final update with any remaining buffer
      if (updateBuffer) {
        try {
          await ctx.runMutation(internal.messages.updateMessage, {
            messageId: args.assistantMessageId,
            streamedContent: responseContent,
          });
        } catch (finalUpdateError) {
          console.error("Failed final message update:", finalUpdateError);
        }
      }
    } catch (error) {
      console.error("OpenRouter streaming failed:", error);
      // Keep any partial content if we had started, otherwise provide a friendly fallback
      responseContent =
        responseContent ||
        "I apologize, but I couldn't generate a response. Please try again.";
      errorDetails.push(
        `AI generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // 8. Finalize the assistant message (apply response transformers if any)
    if (
      enhancements.responseTransformers &&
      enhancements.responseTransformers.length > 0 &&
      responseContent
    ) {
      for (const transform of enhancements.responseTransformers) {
        try {
          responseContent = transform(responseContent);
        } catch {}
      }
    }

    await ctx.runMutation(internal.messages.updateMessage, {
      messageId: args.assistantMessageId,
      content: responseContent,
      isStreaming: false,
      thinking: "", // Clear thinking state
    });

    // 9. Update rolling summary to reduce future planner tokens
    try {
      // Build compact summary from the most recent history (including the final response)
      const summaryParts: string[] = [];
      const recentForSummary = messageHistory.slice(-10);
      for (const m of recentForSummary) {
        summaryParts.push(`${m.role}: ${(m.content || "").slice(0, 200)}`);
      }
      if (responseContent) {
        summaryParts.push(`assistant: ${responseContent.slice(0, 400)}`);
      }
      const compactSummary = summaryParts.join(" \n ").slice(0, 2000);
      await ctx.runMutation(internal.chats.updateRollingSummary, {
        chatId: args.chatId,
        summary: compactSummary,
      });
    } catch (e) {
      console.warn("Failed to update rolling summary", e);
    }
    return null;
  },
});
