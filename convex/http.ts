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
			console.log("🤖 Attempting OpenRouter API call...");
			const openRouterBody = {
				model: "google/gemini-2.5-flash-lite",
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: message },
				],
				temperature: 0.7,
				max_tokens: 4000,
				reasoning: {
					effort: "high",
					exclude: false,
				},
			};

			console.log("🤖 OPENROUTER REQUEST:");
			console.log("URL:", "https://openrouter.ai/api/v1/chat/completions");
			console.log("Body:", JSON.stringify(openRouterBody, null, 2));

			const response = await fetch(
				"https://openrouter.ai/api/v1/chat/completions",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(openRouterBody),
				},
			);

			console.log("🤖 OPENROUTER RESPONSE STATUS:", response.status);
			console.log(
				"🤖 OPENROUTER RESPONSE HEADERS:",
				Object.fromEntries(response.headers.entries()),
			);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("🤖 OPENROUTER ERROR RESPONSE:", errorText);
				throw new Error(
					`OpenRouter API error: ${response.status} - ${errorText}`,
				);
			}

			const data = await response.json();
			console.log(
				"🤖 OPENROUTER RESPONSE BODY:",
				JSON.stringify(data, null, 2),
			);

			const aiMessage = data.choices[0].message;
			const responseContent =
				aiMessage.content ||
				"I apologize, but I couldn't generate a response. Please try again.";
			const reasoningTokens = aiMessage.reasoning || null;

			const successResponse = {
				response: responseContent,
				reasoning: reasoningTokens,
				searchResults,
				sources,
			};

			console.log(
				"🤖 OPENROUTER SUCCESS RESPONSE:",
				JSON.stringify(successResponse, null, 2),
			);

			return new Response(JSON.stringify(successResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("❌ OPENROUTER FAILED:", error);
			console.error(
				"OpenRouter Error stack:",
				error instanceof Error ? error.stack : "No stack trace",
			);

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
