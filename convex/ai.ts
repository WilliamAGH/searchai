import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";

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

// Helper function to handle streaming from OpenRouter with enhanced error reporting
async function* streamOpenRouter(body: OpenRouterBody) {
	console.log("🔄 OpenRouter streaming request initiated:", {
		model: body.model,
		messageCount: body.messages.length,
		temperature: body.temperature,
		max_tokens: body.max_tokens,
	});

	try {
		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ...body, stream: true }),
			},
		);

		console.log("📊 OpenRouter response received:", {
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

		console.log("✅ OpenRouter streaming started successfully");

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					console.log("🔄 OpenRouter streaming completed:", {
						totalChunks: chunkCount,
					});
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "[DONE]") {
							console.log("✅ OpenRouter streaming finished with [DONE]");
							return;
						}
						try {
							chunkCount++;
							const parsedData = JSON.parse(data);
							yield parsedData;
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

export const generateStreamingResponse = action({
	args: {
		chatId: v.id("chats"),
		message: v.string(),
	},
	handler: async (ctx, args) => {
		// 1. Add user message to chat
		await ctx.runMutation(internal.messages.addMessage, {
			chatId: args.chatId,
			role: "user",
			content: args.message,
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
			userMessage: args.message,
		});
	},
});

export const generationStep = internalAction({
	args: {
		chatId: v.id("chats"),
		assistantMessageId: v.id("messages"),
		userMessage: v.string(),
	},
	handler: async (ctx, args) => {
		let searchResults: Array<{
			title: string;
			url: string;
			snippet: string;
			relevanceScore?: number;
		}> = [];
		let searchContext = "";
		const sources: string[] = [];
		let hasRealResults = false;
		let searchMethod: "serp" | "openrouter" | "duckduckgo" | "fallback" =
			"fallback";
		const errorDetails: string[] = [];

		try {
			// 4. Search the web
			await ctx.runMutation(internal.messages.updateMessage, {
				messageId: args.assistantMessageId,
				thinking: "Searching the web...",
			});

			const searchResponse = await ctx.runAction(api.search.searchWeb, {
				query: args.userMessage,
				maxResults: 5,
			});

			searchResults = searchResponse.results || [];
			hasRealResults = searchResponse.hasRealResults || false;
			searchMethod = searchResponse.searchMethod as "serp" | "openrouter" | "duckduckgo" | "fallback";

			await ctx.runMutation(internal.messages.updateMessage, {
				messageId: args.assistantMessageId,
				thinking: `Found ${searchResults.length} results. Parsing content...`,
				searchResults,
				searchMethod,
				hasRealResults,
			});

			if (searchResults.length > 0) {
				// 5. Scrape content from top results
				const contentPromises = searchResults
					.slice(0, 3)
					.map(async (result: { url: string; title: string; snippet: string }) => {
						try {
							const content = await ctx.runAction(api.search.scrapeUrl, {
								url: result.url,
							});
							sources.push(result.url);
							return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
						} catch (error) {
							errorDetails.push(
								`Failed to scrape ${result.url}: ${error instanceof Error ? error.message : "Unknown error"}`,
							);
							return `Source: ${result.title} (${result.url})\n${result.snippet}`;
						}
					});
				const contents = await Promise.all(contentPromises);
				searchContext = contents.join("\n\n");

				await ctx.runMutation(internal.messages.updateMessage, {
					messageId: args.assistantMessageId,
					sources,
				});
			}
		} catch (error) {
			console.error("Search failed:", error);
			errorDetails.push(
				`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		// 6. Fetch chat history for context - include ALL previous messages
		const messages = await ctx.runQuery(api.chats.getChatMessages, {
			chatId: args.chatId,
		});
		// Build full message history, excluding the current assistant message being generated
		const messageHistory = messages
			.filter((m) => m._id !== args.assistantMessageId)
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
		
		if (hasRealResults && searchContext) {
			systemPrompt += `Use the following search results to inform your response. Cite sources naturally when relevant.\n\n`;
			systemPrompt += `## Search Results (${searchResults.length} sources found):\n${searchContext}\n\n`;
			systemPrompt += `## Search Metadata:\n`;
			searchResults.forEach((result: { title: string; url: string; snippet: string }, idx: number) => {
				systemPrompt += `${idx + 1}. ${result.title}\n   URL: ${result.url}\n   Snippet: ${result.snippet}\n\n`;
			});
		} else if (!hasRealResults && searchResults.length > 0) {
			systemPrompt += `Limited search results available. Use what's available and supplement with your knowledge.\n\n`;
			systemPrompt += `## Available Results:\n`;
			searchResults.forEach((result: { title: string; snippet: string }) => {
				systemPrompt += `- ${result.title}: ${result.snippet}\n`;
			});
		} else {
			systemPrompt = `You are a helpful AI assistant. Web search was not successful. Provide helpful responses based on your knowledge.`;
		}
		
		systemPrompt += `\n\nProvide clear, helpful responses. Always format output using strict GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language tags. Avoid arbitrary HTML beyond <u>. This is a continued conversation, so consider the full context of previous messages.`;

		const openRouterBody = {
			model: "google/gemini-2.5-flash",
			messages: [
				{ 
					role: "system", 
					content: systemPrompt,
					// Enable caching for the system prompt with search context
					cache_control: searchContext.length > 1000 ? { type: "ephemeral" } : undefined
				},
				...messageHistory
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
			for await (const chunk of streamOpenRouter(openRouterBody)) {
                if (chunk.choices?.[0]?.delta) {
					if (chunk.choices[0].delta.content) {
						responseContent += chunk.choices[0].delta.content;
						updateBuffer += chunk.choices[0].delta.content;
						
						const now = Date.now();
						const shouldUpdate = now - lastUpdateTime >= UPDATE_INTERVAL_MS || !hasStartedContent;
						
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
								// Log but don't fail the entire stream
								console.error("Failed to update message during streaming:", mutationError);
							}
						}
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
                responseContent || "I apologize, but I couldn't generate a response. Please try again.";
			errorDetails.push(
				`AI generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		// 8. Finalize the assistant message
		await ctx.runMutation(internal.messages.updateMessage, {
			messageId: args.assistantMessageId,
			content: responseContent,
			isStreaming: false,
			thinking: undefined, // Clear thinking state
		});
	},
});
