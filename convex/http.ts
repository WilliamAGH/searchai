/**
 * HTTP endpoints for unauthenticated API access
 * - CORS-enabled for cross-origin requests
 * - SSE streaming for AI responses
 * - Fallback handling for missing APIs
 * - Routes: /api/chat, /api/search, /api/scrape, /api/ai
 */

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

/**
 * Search result interface for type safety
 */
interface SearchResult {
	title: string;
	snippet: string;
	url: string;
}

/**
 * Helper function to add CORS headers to responses
 * - Allows all origins (*)
 * - Supports GET, POST, OPTIONS
 * - Returns JSON content type
 * @param body - JSON string response body
 * @param status - HTTP status code (default 200)
 * @returns Response with CORS headers
 */
function corsResponse(body: string, status = 200) {
	return new Response(body, {
		status,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
		},
	});
}

/**
 * HTTP router for unauthenticated endpoints.
 *
 * Routes:
 * - POST /api/chat   : simple chat demo endpoint
 * - POST /api/search : web search for unauthenticated users
 * - POST /api/scrape : scrape URL and return cleaned content
 * - POST /api/ai     : AI generation with SSE streaming
 */
const http = httpRouter();

/**
 * CORS preflight handler for /api/chat
 * - Returns 204 No Content
 * - Sets CORS headers
 */
http.route({
    path: "/api/chat",
    method: "OPTIONS",
    handler: httpAction(async () => {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }),
});

/**
 * CORS preflight handler for /api/search
 * - Returns 204 No Content
 * - Sets CORS headers
 */
http.route({
	path: "/api/search",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			},
		});
	}),
});

http.route({
	path: "/api/scrape",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			},
		});
	}),
});

http.route({
	path: "/api/ai",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			},
		});
	}),
});

http.route({
	path: "/api/chat",
	method: "POST",
	handler: httpAction(async (_ctx, request) => {
		const { messages } = await request.json();
		const result = await streamText({
			model: openai("gpt-4-turbo"),
			messages,
		});
    // Add CORS headers to the streaming response
    const base = result.toTextStreamResponse();
    const headers = new Headers(base.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("Vary", "Origin");
    return new Response(base.body, { status: base.status, headers });
	}),
});

/**
 * Web search endpoint for unauthenticated users
 * - Calls searchWeb action
 * - Returns results with fallback
 * - Logs detailed debug info
 * @body {query: string, maxResults?: number}
 * @returns {results, searchMethod, hasRealResults}
 */
http.route({
	path: "/api/search",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
    const { query, maxResults } = await request.json();
    if (!query || String(query).trim().length === 0) {
      return corsResponse(
        JSON.stringify({ results: [], searchMethod: "fallback", hasRealResults: false })
      );
    }

		console.log("🔍 SEARCH ENDPOINT CALLED:");
		console.log("Query:", query);
		console.log("Max Results:", maxResults);
		console.log("Environment Variables Available:");
		console.log(
			"- SERP_API_KEY:",
			process.env.SERP_API_KEY ? "SET" : "NOT SET",
		);
		console.log(
			"- OPENROUTER_API_KEY:",
			process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
		);

		try {
			const result = await ctx.runAction(api.search.searchWeb, {
				query,
				maxResults: maxResults || 5,
			});

			console.log("🔍 SEARCH RESULT:", JSON.stringify(result, null, 2));

			return corsResponse(JSON.stringify(result));
		} catch (error) {
			console.error("❌ SEARCH API ERROR:", error);
			console.error(
				"Error stack:",
				error instanceof Error ? error.stack : "No stack trace",
			);

			// Create fallback search results
			const fallbackResults = [
				{
					title: `Search for: ${query}`,
					url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
					snippet:
						"Search results temporarily unavailable. Click to search manually.",
					relevanceScore: 0.3,
				},
			];

			const errorResponse = {
				results: fallbackResults,
				searchMethod: "fallback",
				hasRealResults: false,
				error: error instanceof Error ? error.message : "Search failed",
				errorDetails: {
					message: error instanceof Error ? error.message : "Unknown error",
					stack: error instanceof Error ? error.stack : undefined,
					timestamp: new Date().toISOString(),
				},
			};

			console.log(
				"🔍 SEARCH FALLBACK RESPONSE:",
				JSON.stringify(errorResponse, null, 2),
			);

			return corsResponse(JSON.stringify(errorResponse));
		}
	}),
});

/**
 * URL scraping endpoint
 * - Extracts page content
 * - Returns title, content, summary
 * - Handles errors gracefully
 * @body {url: string}
 * @returns {title, content, summary}
 */
http.route({
	path: "/api/scrape",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const { url } = await request.json();

		console.log("🌐 SCRAPE ENDPOINT CALLED:");
		console.log("URL:", url);

		try {
			const result = await ctx.runAction(api.search.scrapeUrl, { url });

			console.log("🌐 SCRAPE RESULT:", JSON.stringify(result, null, 2));

			return corsResponse(JSON.stringify(result));
		} catch (error) {
			console.error("❌ SCRAPE API ERROR:", error);
			console.error(
				"Error stack:",
				error instanceof Error ? error.stack : "No stack trace",
			);

      let hostname = "";
      try { hostname = new URL(url).hostname; } catch { hostname = "unknown"; }
			const errorResponse = {
				title: hostname,
				content: `Unable to fetch content from ${url}. Error: ${error instanceof Error ? error.message : "Unknown error"}`,
				summary: `Content unavailable from ${hostname}`,
				errorDetails: {
					message: error instanceof Error ? error.message : "Unknown error",
					stack: error instanceof Error ? error.stack : undefined,
					timestamp: new Date().toISOString(),
				},
			};

			console.log(
				"🌐 SCRAPE ERROR RESPONSE:",
				JSON.stringify(errorResponse, null, 2),
			);

			return corsResponse(JSON.stringify(errorResponse));
		}
	}),
});

/**
 * AI generation endpoint with SSE streaming
 * - Primary: OpenRouter (Gemini 2.5 Flash)
 * - Fallback: Convex OpenAI (GPT-4.1 nano)
 * - Final: Search results summary
 * - Streams chunks via Server-Sent Events
 * - 120s timeout with keepalive pings
 * @body {message, systemPrompt, searchResults, sources, chatHistory}
 * @returns SSE stream with chunks or JSON fallback
 */
http.route({
	path: "/api/ai",
	method: "POST",
	handler: httpAction(async (_ctx, request) => {
		const { message, systemPrompt, searchResults, sources, chatHistory } =
			await request.json();

    console.log("🤖 AI ENDPOINT CALLED:");
    console.log("Message length:", typeof message === 'string' ? message.length : 0);
    console.log("System Prompt length:", systemPrompt?.length || 0);
    console.log("Search Results count:", searchResults?.length || 0);
    console.log("Sources count:", sources?.length || 0);
    console.log("Chat History count:", chatHistory?.length || 0);
		console.log("Environment Variables Available:");
		console.log(
			"- OPENROUTER_API_KEY:",
			process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
		);
		console.log(
			"- CONVEX_OPENAI_API_KEY:",
			process.env.CONVEX_OPENAI_API_KEY ? "SET" : "NOT SET",
		);
		console.log(
			"- CONVEX_OPENAI_BASE_URL:",
			process.env.CONVEX_OPENAI_BASE_URL ? "SET" : "NOT SET",
		);

		// Check if OpenRouter API key is available
		if (!process.env.OPENROUTER_API_KEY) {
			console.log("🤖 No OpenRouter API key, trying Convex OpenAI...");

			// Try Convex OpenAI fallback
			if (
				process.env.CONVEX_OPENAI_API_KEY &&
				process.env.CONVEX_OPENAI_BASE_URL
			) {
				try {
					const convexOpenAIBody = {
						model: "gpt-4.1-nano",
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: message },
						],
						temperature: 0.7,
						max_tokens: 2000,
					};

					console.log("🤖 CONVEX OPENAI REQUEST:");
					console.log(
						"URL:",
						`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`,
					);
            console.log("Body (redacted):", {
              model: convexOpenAIBody.model,
              messagesCount: convexOpenAIBody.messages?.length ?? 0,
              sysPromptChars: (convexOpenAIBody.messages?.[0]?.content?.length) ?? 0,
              userMsgChars: (convexOpenAIBody.messages?.[1]?.content?.length) ?? 0,
              temperature: convexOpenAIBody.temperature,
              max_tokens: convexOpenAIBody.max_tokens,
            });

					const response = await fetch(
						`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${process.env.CONVEX_OPENAI_API_KEY}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify(convexOpenAIBody),
						},
					);

					console.log("🤖 CONVEX OPENAI RESPONSE STATUS:", response.status);
					console.log(
						"🤖 CONVEX OPENAI RESPONSE HEADERS:",
						Object.fromEntries(response.headers.entries()),
					);

					if (response.ok) {
						const data = await response.json();
						console.log(
							"🤖 CONVEX OPENAI RESPONSE BODY:",
							JSON.stringify(data, null, 2),
						);

						const responseContent =
							data.choices[0].message.content ||
							"I apologize, but I couldn't generate a response.";

						const successResponse = {
							response: responseContent,
							searchResults,
							sources,
						};

						console.log(
							"🤖 CONVEX OPENAI SUCCESS RESPONSE:",
							JSON.stringify(successResponse, null, 2),
						);

						return corsResponse(JSON.stringify(successResponse));
					} else {
						const errorText = await response.text();
						console.error("🤖 CONVEX OPENAI ERROR RESPONSE:", errorText);
						throw new Error(
							`Convex OpenAI failed: ${response.status} - ${errorText}`,
						);
					}
				} catch (convexError) {
					console.error("🤖 CONVEX OPENAI EXCEPTION:", convexError);
					console.error(
						"Convex OpenAI Error stack:",
						convexError instanceof Error ? convexError.stack : "No stack trace",
					);
				}
			}

			// Final fallback - create response from search results
			const fallbackResponse =
				searchResults && searchResults.length > 0
					? `Based on the search results I found:\n\n${searchResults
							.map(
								(r: SearchResult) =>
									`**${r.title}**\n${r.snippet}\nSource: ${r.url}`,
							)
							.join("\n\n")
							.substring(
								0,
								1500,
							)}...\n\n*Note: AI processing is currently unavailable, but the above search results should help answer your question.*`
					: `I'm unable to process your question with AI right now due to missing API configuration. However, I can suggest searching for "${message}" on:\n\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})\n- [Wikipedia](https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(message)})`;

			const fallbackResponseObj = {
				response: fallbackResponse,
				searchResults,
				sources,
				error: "No AI API keys configured",
			};

			console.log(
				"🤖 AI FALLBACK RESPONSE:",
				JSON.stringify(fallbackResponseObj, null, 2),
			);

			return corsResponse(JSON.stringify(fallbackResponseObj));
		}

		try {
			console.log("🔄 Attempting OpenRouter API call with streaming...");
			
			// Build message history including system prompt and chat history
            const messages = [
                { role: "system", content: `${systemPrompt}\n\nAlways respond using GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language. Avoid arbitrary HTML beyond <u>.` },
				...(chatHistory || []),
				{ role: "user", content: message },
			];
			
			const openRouterBody = {
				model: "google/gemini-2.5-flash",
				messages,
				temperature: 0.7,
				max_tokens: 4000,
				stream: true,
				// Enable caching for repeated context
				top_p: 1,
				frequency_penalty: 0,
				presence_penalty: 0,
			};

			console.log("🤖 OPENROUTER REQUEST:");
			console.log("URL:", "https://openrouter.ai/api/v1/chat/completions");
            console.log("Body (redacted):", {
              model: openRouterBody.model,
              messagesCount: openRouterBody.messages?.length ?? 0,
              sysPromptChars: (openRouterBody.messages?.[0]?.content?.length) ?? 0,
              temperature: openRouterBody.temperature,
              max_tokens: openRouterBody.max_tokens,
              stream: openRouterBody.stream,
            });

            // Add timeout for the fetch request (90s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);

			const response = await fetch(
				"https://openrouter.ai/api/v1/chat/completions",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://searchai.io",
						"X-Title": "SearchAI",
					},
					body: JSON.stringify(openRouterBody),
					signal: controller.signal,
				},
			);

			clearTimeout(timeoutId);

			console.log("📊 OpenRouter Response Status:", response.status);
			console.log(
				"📊 OpenRouter Response Headers:",
				Object.fromEntries(response.headers.entries()),
			);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ OpenRouter API Error:", {
					status: response.status,
					statusText: response.statusText,
					error: errorText,
				});
				throw new Error(
					`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			if (response.body) {
				console.log("✅ OpenRouter streaming response started");
				
                /**
                 * Create SSE stream with cleanup
                 * - Keepalive pings every 15s
                 * - 120s timeout refresh on activity
                 * - Proper resource cleanup
                 */
                const stream = new ReadableStream({
					async start(controller) {
						if (!response.body) {
							controller.close();
							return;
						}
						const reader = response.body.getReader();
						const decoder = new TextDecoder();
						let buffer = "";
						let chunkCount = 0;
                        let lastChunkTime = Date.now();
						let isStreamActive = true;
						
                        // Periodic keepalive pings and adaptive timeout for streaming
                        const pingIntervalMs = 15000;
                        const pingIntervalId = setInterval(() => {
							if (!isStreamActive) {
								clearInterval(pingIntervalId);
								return;
							}
                            // SSE comment line; ignored by client parser but keeps connections alive
                            try {
								controller.enqueue(new TextEncoder().encode(`: keepalive ${Date.now()}\n\n`));
							} catch {
								// Controller might be closed, stop pinging
								clearInterval(pingIntervalId);
							}
                        }, pingIntervalMs);

                        let streamTimeoutId = setTimeout(() => {
							if (!isStreamActive) return;
                            console.error("⏰ OpenRouter stream timeout after 120 seconds");
							isStreamActive = false;
							try {
								controller.error(new Error("OpenRouter stream timeout after 120 seconds"));
							} catch {
								// Controller might already be closed
							}
                        }, 120000);
						
						// Cleanup function
						const cleanup = () => {
							isStreamActive = false;
							clearTimeout(streamTimeoutId);
							clearInterval(pingIntervalId);
							try {
								reader.releaseLock();
							} catch {
								// Reader might already be released
							}
						};
						
						try {
							while (isStreamActive) {
								const { done, value } = await reader.read();
								if (done) {
									console.log("🔄 OpenRouter streaming completed:", {
										totalChunks: chunkCount,
										duration: Date.now() - lastChunkTime,
									});
									break;
								}
								
                                lastChunkTime = Date.now();
                                // Refresh timeout upon activity
                                clearTimeout(streamTimeoutId);
                                streamTimeoutId = setTimeout(() => {
									if (!isStreamActive) return;
                                    console.error("⏰ OpenRouter stream timeout after 120 seconds");
									isStreamActive = false;
									try {
										controller.error(new Error("OpenRouter stream timeout after 120 seconds"));
									} catch {
										// Controller might already be closed
									}
                                }, 120000);
								
								buffer += decoder.decode(value, { stream: true });
								const lines = buffer.split("\n");
								buffer = lines.pop() || "";
								
								for (const line of lines) {
									if (line.startsWith("data: ")) {
										const data = line.slice(6);
										if (data === "[DONE]") {
											console.log("✅ OpenRouter streaming finished with [DONE]");
											isStreamActive = false;
											controller.close();
											cleanup();
											return;
										}
										try {
											chunkCount++;
											const chunk = JSON.parse(data);
                        const streamData = {
												type: "chunk",
												content: chunk.choices?.[0]?.delta?.content || "",
												thinking: chunk.choices?.[0]?.delta?.reasoning || "",
												searchResults,
												sources,
												provider: "openrouter",
                          model: "google/gemini-2.5-flash",
												chunkNumber: chunkCount,
											};
											controller.enqueue(
												new TextEncoder().encode(
													`data: ${JSON.stringify(streamData)}\n\n`
												)
											);
										} catch (e) {
											console.error("❌ Failed to parse stream chunk:", {
												error: e instanceof Error ? e.message : "Unknown parsing error",
												chunk: data,
												chunkNumber: chunkCount,
											});
										}
									}
								}
							}
							// Normal completion
							controller.close();
                        } catch (error) {
							console.error("💥 Stream reading error:", {
								error: error instanceof Error ? error.message : "Unknown streaming error",
								stack: error instanceof Error ? error.stack : "No stack trace",
								timestamp: new Date().toISOString(),
							});
							try {
								controller.error(error);
							} catch {
								// Controller might already be closed
							}
						} finally {
							cleanup();
						}
					},
				});
				
                return new Response(stream, {
                    headers: {
                        // Harden SSE headers to avoid buffering by proxies and ensure UTF-8
                        "Content-Type": "text/event-stream; charset=utf-8",
                        "Cache-Control": "no-cache, no-transform",
                        "Connection": "keep-alive",
                        // Disable proxy buffering on common reverse proxies (harmless elsewhere)
                        "X-Accel-Buffering": "no",
                        // CORS: endpoints are proxied locally during dev
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Headers": "Content-Type",
                        "Vary": "Origin",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    },
                });
			} else {
				throw new Error("No response body received from OpenRouter");
			}
		} catch (error) {
			console.error("💥 OPENROUTER FAILED with exception:", {
				error: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : "No stack trace",
				timestamp: new Date().toISOString(),
			});

			// Try Convex OpenAI as backup
			if (
				process.env.CONVEX_OPENAI_API_KEY &&
				process.env.CONVEX_OPENAI_BASE_URL
			) {
				try {
					console.log("🤖 Trying Convex OpenAI fallback...");
					const convexOpenAIBody = {
						model: "gpt-4.1-nano",
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: message },
						],
						temperature: 0.7,
						max_tokens: 2000,
					};

					console.log("🤖 CONVEX OPENAI FALLBACK REQUEST:");
					console.log(
						"URL:",
						`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`,
					);
					console.log("Body:", JSON.stringify(convexOpenAIBody, null, 2));

					const fallbackResponse = await fetch(
						`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${process.env.CONVEX_OPENAI_API_KEY}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify(convexOpenAIBody),
						},
					);

					console.log(
						"🤖 CONVEX OPENAI FALLBACK RESPONSE STATUS:",
						fallbackResponse.status,
					);

					if (fallbackResponse.ok) {
						const fallbackData = await fallbackResponse.json();
						console.log(
							"🤖 CONVEX OPENAI FALLBACK RESPONSE BODY:",
							JSON.stringify(fallbackData, null, 2),
						);

						const responseContent =
							fallbackData.choices[0].message.content ||
							"I apologize, but I couldn't generate a response.";

						const fallbackSuccessResponse = {
							response: responseContent,
							searchResults,
							sources,
						};

						console.log(
							"🤖 CONVEX OPENAI FALLBACK SUCCESS:",
							JSON.stringify(fallbackSuccessResponse, null, 2),
						);

						return corsResponse(JSON.stringify(fallbackSuccessResponse));
					} else {
						const fallbackErrorText = await fallbackResponse.text();
						console.error(
							"🤖 CONVEX OPENAI FALLBACK ERROR:",
							fallbackErrorText,
						);
					}
				} catch (convexError) {
					console.error("🤖 CONVEX OPENAI FALLBACK EXCEPTION:", convexError);
					console.error(
						"Convex OpenAI Fallback Error stack:",
						convexError instanceof Error ? convexError.stack : "No stack trace",
					);
				}
			}

			// Final fallback response with detailed error info
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			const fallbackResponse =
				searchResults && searchResults.length > 0
					? `Based on the search results I found:\n\n${searchResults
							.map(
								(r: SearchResult) =>
									`**${r.title}**\n${r.snippet}\nSource: ${r.url}`,
							)
							.join("\n\n")
							.substring(
								0,
								1500,
							)}...\n\n*Note: AI processing failed (${errorMessage}), but the above search results should help answer your question.*`
					: `I'm having trouble generating a response right now.\n\n**Error details:** ${errorMessage}\n\nPlease try again, or search manually for "${message}" on:\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})`;

			const finalErrorResponse = {
				response: fallbackResponse,
				searchResults,
				sources,
				error: errorMessage,
				errorDetails: {
					message: errorMessage,
					stack: error instanceof Error ? error.stack : undefined,
					timestamp: new Date().toISOString(),
				},
			};

			console.log(
				"🤖 AI FINAL ERROR RESPONSE:",
				JSON.stringify(finalErrorResponse, null, 2),
			);

			return corsResponse(JSON.stringify(finalErrorResponse));
		}
	}),
});

/**
 * Register auth routes
 * - Adds OAuth endpoints
 * - Handles auth callbacks
 */
auth.addHttpRoutes(http);

/**
 * Dynamic Open Graph pages for shared/public chats
 * - GET /p?id=PUBLIC_ID   → indexable public share with per-chat OG
 * - GET /s?id=SHARE_ID    → non-indexable shared link with per-chat OG
 * These endpoints return minimal HTML with populated meta tags for crawlers,
 * and immediately redirect human users to the SPA route on the primary domain.
 */
function buildOgHtml(params: {
  siteUrl: string;
  canonicalPath: string;
  title: string;
  description: string;
  imageUrl: string;
  indexable: boolean;
}): string {
  const { siteUrl, canonicalPath, title, description, imageUrl, indexable } = params;
  const canonical = `${siteUrl}${canonicalPath}`;
  const robots = indexable ? "index, follow" : "noindex, nofollow";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="canonical" href="${canonical}" />
    <meta name="description" content="${description}" />
    <meta name="robots" content="${robots}" />

    <meta property="og:site_name" content="SearchAI" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="SearchAI - AI-Powered Web Search" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:url" content="${canonical}" />
  </head>
  <body>
    <noscript>
      <p>This page contains social metadata for sharing. Open the chat at <a href="${canonical}">${canonical}</a>.</p>
    </noscript>
    <script>
      // Redirect humans to SPA route
      location.replace(${JSON.stringify(canonical)});
    </script>
  </body>
 </html>`;
}

http.route({
  path: "/p",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const publicId = url.searchParams.get("id");
    const siteUrl = process.env.SITE_URL || "https://search-ai.io";
    if (!publicId) {
      return new Response("Missing id", { status: 400 });
    }
    try {
      const chat = await ctx.runQuery(api.chats.getChatByPublicId, { publicId });
      if (!chat) return new Response("Not found", { status: 404 });
      if (chat.privacy !== "public") return new Response("Not public", { status: 403 });

      // Prefer chat.title; fall back to generic
      const title: string = (chat as any)?.title || "SearchAI Chat";
      // Build a short description from rolling summary or server summary action
      let description = (chat as any)?.rollingSummary || "A shared conversation on SearchAI.";
      try {
        const summary = await ctx.runAction(api.chats.summarizeRecentAction, { chatId: (chat as any)._id });
        if (summary) description = summary;
      } catch {}
      description = String(description).replace(/\s+/g, " ").trim().slice(0, 200);

      const imageUrl = `${siteUrl}/images/opengraph/searchai-io-og.png`;
      const html = buildOgHtml({
        siteUrl,
        canonicalPath: `/p/${publicId}`,
        title,
        description,
        imageUrl,
        indexable: true,
      });
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Indexable
          "X-Robots-Tag": "all",
          "Cache-Control": "public, max-age=120, s-maxage=600",
        },
      });
    } catch (e) {
      console.error("/p OG endpoint error", e);
      return new Response("Server error", { status: 500 });
    }
  }),
});

http.route({
  path: "/s",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const shareId = url.searchParams.get("id");
    const siteUrl = process.env.SITE_URL || "https://search-ai.io";
    if (!shareId) {
      return new Response("Missing id", { status: 400 });
    }
    try {
      const chat = await ctx.runQuery(api.chats.getChatByShareId, { shareId });
      if (!chat) return new Response("Not found", { status: 404 });
      // Shared links are not indexable; only "public" should be indexed
      const title: string = (chat as any)?.title || "Shared Chat";
      let description = (chat as any)?.rollingSummary || "A shared conversation on SearchAI.";
      try {
        const summary = await ctx.runAction(api.chats.summarizeRecentAction, { chatId: (chat as any)._id });
        if (summary) description = summary;
      } catch {}
      description = String(description).replace(/\s+/g, " ").trim().slice(0, 200);

      const imageUrl = `${siteUrl}/images/opengraph/searchai-io-og.png`;
      const html = buildOgHtml({
        siteUrl,
        canonicalPath: `/s/${shareId}`,
        title,
        description,
        imageUrl,
        indexable: false,
      });
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Block indexing for shared links
          "X-Robots-Tag": "noindex, nofollow",
          "Cache-Control": "private, max-age=120",
        },
      });
    } catch (e) {
      console.error("/s OG endpoint error", e);
      return new Response("Server error", { status: 500 });
    }
  }),
});

export default http;
