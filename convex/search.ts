/**
 * Search functions
 * - Public web search providers (SERP, OpenRouter, DuckDuckGo)
 * - Planner: summarize recent chat, emit focused queries
 * - Ephemeral cache (in-process) for plan decisions (per chat+message)
 */

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// Ephemeral in-process cache for planner decisions (best-effort only)
type PlanResult = {
  shouldSearch: boolean;
  contextSummary: string;
  queries: string[];
  suggestNewChat: boolean;
  decisionConfidence: number;
  reasons: string;
};
const planCache: Map<string, { expires: number; result: PlanResult }> = new Map();

/**
 * Perform a best-effort web search using available providers.
 * Order of attempts:
 * 1) SERP API (Google via SerpAPI) if SERP_API_KEY is set
 * 2) OpenRouter web-search capable model if OPENROUTER_API_KEY is set
 * 3) DuckDuckGo JSON API as a backup
 * 4) Minimal fallback links
 *
 * Args:
 * - query: The user query string
 * - maxResults: Optional maximum number of results to return (default 5)
 *
 * Returns: { results, searchMethod, hasRealResults }
 */
export const searchWeb = action({
	args: {
		query: v.string(),
		maxResults: v.optional(v.number()),
	},
	handler: async (_ctx, args) => {
		const maxResults = args.maxResults || 5;

		// Try SERP API for DuckDuckGo first if available
		if (process.env.SERP_API_KEY) {
			try {
				const serpResults = await searchWithSerpApiDuckDuckGo(
					args.query,
					maxResults,
				);
				if (serpResults.length > 0) {
					return {
						results: serpResults,
						searchMethod: "serp",
						hasRealResults: true,
					};
				}
			} catch (error) {
				console.warn(
					"SERP API (DuckDuckGo) failed:",
					error instanceof Error ? error.message : "Unknown error",
				);
			}
		} else {
			console.log("SERP API key not available, skipping SERP search");
		}

		// Try OpenRouter web search as fallback
		if (process.env.OPENROUTER_API_KEY) {
			try {
				const openRouterResults = await searchWithOpenRouter(
					args.query,
					maxResults,
				);
				if (openRouterResults.length > 0) {
					return {
						results: openRouterResults,
						searchMethod: "openrouter",
						hasRealResults: true,
					};
				}
			} catch (error) {
				console.warn(
					"OpenRouter search failed:",
					error instanceof Error ? error.message : "Unknown error",
				);
			}
		} else {
			console.log(
				"OpenRouter API key not available, skipping OpenRouter search",
			);
		}

		// Try DuckDuckGo direct API as backup
		try {
			const ddgResults = await searchWithDuckDuckGo(args.query, maxResults);
			if (ddgResults.length > 0) {
				return {
					results: ddgResults,
					searchMethod: "duckduckgo",
					hasRealResults: ddgResults.some((r) => r.relevanceScore > 0.6),
				};
			}
		} catch (error) {
			console.warn(
				"DuckDuckGo search failed:",
				error instanceof Error ? error.message : "Unknown error",
			);
		}

		// Final fallback - return minimal search links
		const fallbackResults = [
			{
				title: `Search for: ${args.query}`,
				url: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
				snippet:
					"Search results temporarily unavailable. Click to search manually.",
				relevanceScore: 0.3,
			},
		];

		return {
			results: fallbackResults,
			searchMethod: "fallback",
			hasRealResults: false,
		};
	},
});

/**
 * Plan a context-aware web search.
 * - Summarizes recent chat context
 * - Optionally calls an LLM to propose focused search queries
 * - Falls back to a single-query plan using the user's message
 */
export const planSearch = action({
  args: {
    chatId: v.id("chats"),
    newMessage: v.string(),
    maxContextMessages: v.optional(v.number()),
  },
  returns: v.object({
    shouldSearch: v.boolean(),
    contextSummary: v.string(),
    queries: v.array(v.string()),
    suggestNewChat: v.boolean(),
    decisionConfidence: v.number(),
    reasons: v.string(),
  }),
  handler: async (ctx, args) => {
    // Cache key: chat + normalized message (first 200 chars)
    const normMsg = args.newMessage.toLowerCase().trim().slice(0, 200);
    const cacheKey = `${args.chatId}|${normMsg}`;
    const now = Date.now();
    const hit = planCache.get(cacheKey);
    if (hit && hit.expires > now) {
      return hit.result;
    }

    const maxContext = Math.max(1, Math.min(args.maxContextMessages ?? 10, 25));

    // Load recent messages for lightweight context summary
    const messages = await ctx.runQuery(api.chats.getChatMessages, {
      chatId: args.chatId,
    });

    const recent = messages.slice(Math.max(0, messages.length - maxContext));
    const serialize = (s: string | undefined) => (s || "").replace(/\s+/g, " ").trim();

    // Simple lexical overlap heuristic with last user message
    const last = recent.length > 0 ? recent[recent.length - 1] : undefined;
    const lastContent = serialize(last?.content);
    const newContent = serialize(args.newMessage);
    const tokenize = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const a = tokenize(lastContent);
    const b = tokenize(newContent);
    const inter = new Set([...a].filter((x) => b.has(x)));
    const unionSize = new Set([...a, ...b]).size || 1;
    const jaccard = inter.size / unionSize;

    // Time-based heuristic
    const lastTs = typeof last?.timestamp === "number" ? last.timestamp : undefined;
    const minutesGap = lastTs ? Math.floor((Date.now() - lastTs) / 60000) : 0;
    const timeSuggestNew = minutesGap >= 120;

    // Build a compact rolling summary (no external call)
    const contextSummary = serialize(
      recent
        .map((m) => `${m.role}: ${serialize(m.content)}`)
        .join(" \n ")
        .slice(0, 1200),
    );

    // Default plan if no LLM is available or JSON parsing fails
    const defaultPlan = {
      shouldSearch: true,
      contextSummary,
      queries: [args.newMessage],
      suggestNewChat: timeSuggestNew ? true : jaccard < 0.5,
      decisionConfidence: timeSuggestNew ? 0.85 : 0.65,
      reasons: `jaccard=${jaccard.toFixed(2)} gapMin=${minutesGap}`,
    };

    // If no API key present, skip LLM planning
    if (!process.env.OPENROUTER_API_KEY) {
      planCache.set(cacheKey, { expires: now + 3 * 60 * 1000, result: defaultPlan });
      return defaultPlan;
    }

    // Only call LLM if the topic boundary is ambiguous; otherwise save tokens
    const borderline = jaccard >= 0.45 && jaccard <= 0.7;
    if (!borderline) {
      planCache.set(cacheKey, { expires: now + 3 * 60 * 1000, result: defaultPlan });
      return defaultPlan;
    }

    try {
      const prompt = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You plan web searches for a conversational assistant. Return strict JSON only with fields: shouldSearch:boolean, contextSummary:string(<=500 tokens), queries:string[], suggestNewChat:boolean, decisionConfidence:number (0-1), reasons:string. Keep queries de-duplicated, concrete, and specific.",
          },
          {
            role: "user",
            content: `Recent context (most recent last):\n${contextSummary}\n\nNew message: ${args.newMessage}\n\nReturn JSON only.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      } as const;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(prompt),
      });

      if (!response.ok) {
        planCache.set(cacheKey, { expires: now + 3 * 60 * 1000, result: defaultPlan });
        return defaultPlan;
      }
      const data = await response.json();
      const text: string = data?.choices?.[0]?.message?.content || "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Some models wrap JSON in code fences; try to extract
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      }

      if (
        parsed &&
        typeof (parsed as any).shouldSearch === "boolean" &&
        typeof (parsed as any).contextSummary === "string" &&
        Array.isArray((parsed as any).queries) &&
        typeof (parsed as any).suggestNewChat === "boolean" &&
        typeof (parsed as any).decisionConfidence === "number" &&
        typeof (parsed as any).reasons === "string"
      ) {
        const plan = parsed as { shouldSearch: boolean; contextSummary: string; queries: string[]; suggestNewChat: boolean; decisionConfidence: number; reasons: string };
        // Sanitize queries
        const queries = Array.from(
          new Set(
            plan.queries
              .map((q) => serialize(q))
              .filter((q) => q.length > 0)
              .slice(0, 6),
          ),
        );
        const finalPlan = {
          shouldSearch: plan.shouldSearch,
          contextSummary: serialize(plan.contextSummary).slice(0, 2000),
          queries: queries.length > 0 ? queries : [args.newMessage],
          suggestNewChat: plan.suggestNewChat,
          decisionConfidence: Math.max(0, Math.min(1, plan.decisionConfidence)),
          reasons: serialize(plan.reasons).slice(0, 500),
        };
        planCache.set(cacheKey, { expires: now + 3 * 60 * 1000, result: finalPlan });
        return finalPlan;
      }
      planCache.set(cacheKey, { expires: now + 3 * 60 * 1000, result: defaultPlan });
      return defaultPlan;
    } catch {
      planCache.set(cacheKey, { expires: now + 3 * 60 * 1000, result: defaultPlan });
      return defaultPlan;
    }
  },
});

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	relevanceScore: number;
}

interface SerpApiResponse {
	organic_results?: Array<{
		title?: string;
		link: string;
		snippet?: string;
		displayed_link?: string;
	}>;
}

// SERP API search function using Google engine with enhanced error reporting
/**
 * Query SerpAPI (Google engine) to retrieve web results.
 * Returns a normalized list of SearchResult.
 */
export async function searchWithSerpApiDuckDuckGo(
	query: string,
	maxResults: number,
): Promise<SearchResult[]> {
	const apiUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}&hl=en&gl=us&num=${maxResults}`;
	console.log("🔍 SERP API Request:", {
		query,
		maxResults,
		timestamp: new Date().toISOString(),
	});

	try {
		const response = await fetch(apiUrl, {
			headers: {
				"User-Agent": "SearchChat/1.0 (Web Search Assistant)",
			},
		});

		console.log("📊 SERP API Response:", {
			status: response.status,
			statusText: response.statusText,
			ok: response.ok,
			url: apiUrl,
		});

		if (!response.ok) {
			const errorText = await response.text();
			const errorMessage = `SERP API returned ${response.status} ${response.statusText}: ${errorText}`;
			console.error("❌ SERP API Error Details:", {
				status: response.status,
				statusText: response.statusText,
				errorText: errorText,
				query: query,
				maxResults: maxResults,
				timestamp: new Date().toISOString(),
			});
			throw new Error(errorMessage);
		}

		const data: SerpApiResponse = await response.json();
		console.log("✅ SERP API Success:", {
			hasOrganic: !!data.organic_results,
			count: data.organic_results?.length || 0,
			query: query,
			timestamp: new Date().toISOString(),
		});

		if (data.organic_results && data.organic_results.length > 0) {
			const results: SearchResult[] = data.organic_results
				.slice(0, maxResults)
				.map((result) => ({
					title: result.title || "Untitled",
					url: result.link,
					snippet: result.snippet || result.displayed_link || "",
					relevanceScore: 0.9,
				}));

			console.log("📋 SERP API Results Parsed:", {
				resultCount: results.length,
				sampleResults: results.slice(0, 2).map((r) => ({
					title: r.title,
					url: r.url,
					snippetLength: r.snippet?.length || 0,
				})),
				timestamp: new Date().toISOString(),
			});

			return results;
		}

		console.log("⚠️ SERP API No Results:", {
			query,
			timestamp: new Date().toISOString(),
		});
		return [];
	} catch (error) {
		console.error("💥 SERP API Exception:", {
			error: error instanceof Error ? error.message : "Unknown error",
			stack: error instanceof Error ? error.stack : "No stack trace",
			query: query,
			timestamp: new Date().toISOString(),
		});
		throw error;
	}
}

interface OpenRouterResponse {
	choices?: Array<{
		message?: {
			content?: string;
			annotations?: Array<{
				type: string;
				url_citation?: {
					title?: string;
					url: string;
					content?: string;
					start_index?: number;
					end_index?: number;
				};
			}>;
		};
	}>;
}

// OpenRouter web search function
/**
 * Use OpenRouter to ask an online-capable model for sources and extract URLs.
 * Returns a normalized list of SearchResult.
 */
export async function searchWithOpenRouter(
	query: string,
	maxResults: number,
): Promise<SearchResult[]> {
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "perplexity/llama-3.1-sonar-small-128k-online",
				messages: [
					{
						role: "system",
						content:
							"You are a web search assistant. Provide factual information with sources. Always cite your sources with URLs.",
					},
					{
						role: "user",
						content: `Search for: ${query}. Provide key information with source URLs.`,
					},
				],
				max_tokens: 1000,
				temperature: 0.1,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`OpenRouter API error: ${response.status}`);
	}

	const data: OpenRouterResponse = await response.json();
	const content = data.choices?.[0]?.message?.content || "";
	const annotations = data.choices?.[0]?.message?.annotations || [];

	// Extract URLs from annotations if available
	const results: SearchResult[] = [];

	if (annotations.length > 0) {
		annotations.forEach((annotation, index) => {
			if (annotation.type === "url_citation" && annotation.url_citation) {
				const citation = annotation.url_citation;
				results.push({
					title: citation.title || `Search Result ${index + 1}`,
					url: citation.url,
					snippet:
						citation.content ||
						content.substring(
							citation.start_index || 0,
							citation.end_index || 200,
						),
					relevanceScore: 0.85,
				});
			}
		});
	}

	// If no annotations, try to extract URLs from content
	if (results.length === 0 && content) {
		const urlRegex = /https?:\/\/[^\s)]+/g;
		const urls = content.match(urlRegex) || [];

		urls.slice(0, maxResults).forEach((url: string, index: number) => {
			results.push({
				title: `Search Result ${index + 1} for: ${query}`,
				url: url,
				snippet: `${content.substring(0, 200)}...`,
				relevanceScore: 0.75,
			});
		});
	}

	return results.slice(0, maxResults);
}

interface DuckDuckGoResponse {
	RelatedTopics?: Array<{
		FirstURL?: string;
		Text?: string;
	}>;
	Abstract?: string;
	AbstractURL?: string;
	Heading?: string;
}

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	relevanceScore: number;
}

// DuckDuckGo direct API search function
/**
 * Call DuckDuckGo's JSON API and normalize results.
 * Returns a normalized list of SearchResult with reasonable fallbacks.
 */
export async function searchWithDuckDuckGo(
	query: string,
	maxResults: number,
): Promise<SearchResult[]> {
	const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
	const response = await fetch(searchUrl, {
		headers: {
			"User-Agent": "SearchChat/1.0 (Web Search Assistant)",
		},
	});

	if (!response.ok) {
		throw new Error(`DuckDuckGo API returned ${response.status}`);
	}

	const data: DuckDuckGoResponse = await response.json();
	let results: SearchResult[] = [];

	// Extract results from DuckDuckGo response
	if (data.RelatedTopics && data.RelatedTopics.length > 0) {
		results = data.RelatedTopics
			.filter(
				(topic) =>
					topic.FirstURL && topic.Text && topic.FirstURL.startsWith("http"),
			)
			.slice(0, maxResults)
			.map((topic) => ({
				title: topic.Text?.split(" - ")[0] || topic.Text?.substring(0, 100) || "Untitled",
				url: topic.FirstURL || "",
				snippet: topic.Text || "",
				relevanceScore: 0.7,
			}));
	}

	// If no results from RelatedTopics, try Abstract
	if (results.length === 0 && data.Abstract && data.AbstractURL) {
		results = [
			{
				title: data.Heading || query,
				url: data.AbstractURL,
				snippet: data.Abstract,
				relevanceScore: 0.8,
			},
		];
	}

	// Enhanced fallback with better search URLs
	if (results.length === 0) {
		const fallbackSources: SearchResult[] = [
			{
				title: `${query} - Wikipedia`,
				url: `https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(query)}`,
				snippet: `Wikipedia search results for "${query}"`,
				relevanceScore: 0.6,
			},
			{
				title: `${query} - Search Results`,
				url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
				snippet: `Web search results for "${query}"`,
				relevanceScore: 0.4,
			},
		];

		results = fallbackSources.slice(0, Math.min(2, maxResults));
	}

	return results;
}

/**
 * Fetch a page and extract a readable, cleaned summary of its content.
 * Performs lightweight sanitization and truncation to keep payload small.
 *
 * Args:
 * - url: Absolute URL to fetch
 *
 * Returns: { title, content, summary }
 */
export const scrapeUrl = action({
	args: { url: v.string() },
	handler: async (
		_,
		args,
	): Promise<{
		title: string;
		content: string;
		summary?: string;
	}> => {
		console.log("🌐 Scraping URL initiated:", {
			url: args.url,
			timestamp: new Date().toISOString(),
		});

		try {
			const response = await fetch(args.url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (compatible; SearchChat/1.0; Web Content Reader)",
					Accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.5",
					"Accept-Encoding": "gzip, deflate",
					Connection: "keep-alive",
				},
				signal: AbortSignal.timeout(10000), // 10 second timeout
			});

			console.log("📊 Scrape response received:", {
				url: args.url,
				status: response.status,
				statusText: response.statusText,
				ok: response.ok,
			});

			if (!response.ok) {
				const errorDetails = {
					url: args.url,
					status: response.status,
					statusText: response.statusText,
					timestamp: new Date().toISOString(),
				};
				console.error("❌ HTTP error during scraping:", errorDetails);
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const contentType = response.headers.get("content-type") || "";
			console.log("📄 Content type check:", {
				url: args.url,
				contentType: contentType,
			});

			if (!contentType.includes("text/html")) {
				const errorDetails = {
					url: args.url,
					contentType: contentType,
					timestamp: new Date().toISOString(),
				};
				console.error("❌ Non-HTML content type:", errorDetails);
				throw new Error(`Not an HTML page. Content-Type: ${contentType}`);
			}

			const html = await response.text();
			console.log("✅ HTML content fetched:", {
				url: args.url,
				contentLength: html.length,
				timestamp: new Date().toISOString(),
			});

			// Extract title using regex
			const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
			let title = titleMatch ? titleMatch[1].trim() : "";

			// Try h1 if no title
			const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
			if (!title) {
				title = h1Match ? h1Match[1].trim() : new URL(args.url).hostname;
			}

			console.log("🏷️ Title extracted:", {
				url: args.url,
				title: title,
				method: titleMatch ? "title tag" : h1Match ? "h1 tag" : "hostname",
			});

			// Remove script and style tags, then extract text content
			let content = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/&nbsp;/g, " ")
				.replace(/&/g, "&")
				.replace(/</g, "<")
				.replace(/>/g, ">")
				.replace(/"/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/\s+/g, " ")
				.trim();

			console.log("🧹 Content cleaned:", {
				url: args.url,
				originalLength: html.length,
				cleanedLength: content.length,
			});

			// Filter out low-quality content
			if (content.length < 100) {
				const errorDetails = {
					url: args.url,
					contentLength: content.length,
					timestamp: new Date().toISOString(),
				};
				console.error("❌ Content too short after cleaning:", errorDetails);
				throw new Error(`Content too short (${content.length} characters)`);
			}

			// Remove common junk patterns
			const junkPatterns = [
				/cookie policy/gi,
				/accept cookies/gi,
				/privacy policy/gi,
				/terms of service/gi,
				/subscribe to newsletter/gi,
				/follow us on/gi,
				/share this article/gi,
			];

			let removedJunkCount = 0;
			for (const pattern of junkPatterns) {
				const matches = content.match(pattern);
				if (matches) {
					removedJunkCount += matches.length;
				}
				content = content.replace(pattern, "");
			}

			console.log("🗑️ Junk content removed:", {
				url: args.url,
				removedCount: removedJunkCount,
			});

			// Limit content length
			if (content.length > 5000) {
				content = `${content.substring(0, 5000)}...`;
				console.log("✂️ Content truncated:", {
					url: args.url,
					newLength: content.length,
				});
			}

			// Generate summary (first few sentences)
			const summaryLength = Math.min(500, content.length);
			const summary =
				content.substring(0, summaryLength) +
				(content.length > summaryLength ? "..." : "");

			const result = { title, content, summary };
			console.log("✅ Scraping completed successfully:", {
				url: args.url,
				resultLength: content.length,
				summaryLength: summary.length,
				timestamp: new Date().toISOString(),
			});

			return result;
		} catch (error) {
			console.error("💥 Scraping failed with exception:", {
				url: args.url,
				error: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : "No stack trace",
				timestamp: new Date().toISOString(),
			});

			const hostname = new URL(args.url).hostname;
			const errorMessage = error instanceof Error ? error.message : "Unknown error";

			return {
				title: hostname,
				content: `Unable to fetch content from ${args.url}: ${errorMessage}`,
				summary: `Content unavailable from ${hostname}`,
			};
		}
	},
});
