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

const http = httpRouter();

http.route({
	path: "/api/chat",
	method: "POST",
	handler: httpAction(async (_ctx, request) => {
		const { messages } = await request.json();
		const result = await streamText({
			model: openai("gpt-4-turbo"),
			messages,
		});
		return result.toTextStreamResponse();
	}),
});

// Search endpoint for unauthenticated users
http.route({
	path: "/api/search",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const { query, maxResults } = await request.json();

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

			return new Response(JSON.stringify(result), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
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

			return new Response(JSON.stringify(errorResponse), {
				status: 200, // Return 200 so the client can handle gracefully
				headers: { "Content-Type": "application/json" },
			});
		}
	}),
});

// Scrape endpoint for unauthenticated users
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

			return new Response(JSON.stringify(result), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("❌ SCRAPE API ERROR:", error);
			console.error(
				"Error stack:",
				error instanceof Error ? error.stack : "No stack trace",
			);

			const hostname = new URL(url).hostname;
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

			return new Response(JSON.stringify(errorResponse), {
				status: 200, // Return 200 so the client can handle gracefully
				headers: { "Content-Type": "application/json" },
			});
		}
	}),
});

// AI generation endpoint for unauthenticated users with streaming support
http.route({
	path: "/api/ai",
	method: "POST",
	handler: httpAction(async (_ctx, request) => {
		const { message, systemPrompt, searchResults, sources, chatHistory } =
			await request.json();

		console.log("🤖 AI ENDPOINT CALLED:");
		console.log("Message:", message);
		console.log("System Prompt Length:", systemPrompt?.length || 0);
		console.log("Search Results Count:", searchResults?.length || 0);
		console.log("Sources Count:", sources?.length || 0);
		console.log("Chat History Length:", chatHistory?.length || 0);
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
					console.log("Body:", JSON.stringify(convexOpenAIBody, null, 2));

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

						return new Response(JSON.stringify(successResponse), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						});
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

			return new Response(JSON.stringify(fallbackResponseObj), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		try {
			console.log("🔄 Attempting OpenRouter API call with streaming...");
			
			// Build message history including system prompt and chat history
			const messages = [
				{ role: "system", content: systemPrompt },
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
			console.log("Body:", JSON.stringify(openRouterBody, null, 2));

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
				
                // Create a streaming response with proper cleanup
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
												model: "google/gemini-flash-1.5",
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

						return new Response(JSON.stringify(fallbackSuccessResponse), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						});
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

			return new Response(JSON.stringify(finalErrorResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
	}),
});

// Add auth routes
auth.addHttpRoutes(http);

export default http;
