import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";

// Helper function to handle streaming from OpenRouter
async function* streamOpenRouter(body: any) {
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

	if (!response.ok || !response.body) {
		const errorText = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			if (line.startsWith("data: ")) {
				const data = line.slice(6);
				if (data === "[DONE]") {
					return;
				}
				try {
					yield JSON.parse(data);
				} catch (e) {
					console.error("Failed to parse stream chunk:", e);
				}
			}
		}
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
		let searchResults: any[] = [];
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
			searchMethod = searchResponse.searchMethod as any;

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
					.map(async (result: any) => {
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

		// 6. Fetch chat history for context
		const messages = await ctx.runQuery(api.chats.getChatMessages, {
			chatId: args.chatId,
		});
		const messageHistory = messages.map((m) => ({
			role: m.role,
			content: m.content || "",
		}));

		// 7. Generate AI response with streaming
		await ctx.runMutation(internal.messages.updateMessage, {
			messageId: args.assistantMessageId,
			thinking: "Generating response...",
		});

		let systemPrompt = `You are a helpful AI assistant. Use the following search results to inform your response. Cite sources naturally.\n\nSearch Results:\n${searchContext}\n\n`;
		if (!hasRealResults) {
			systemPrompt = `You are a helpful AI assistant. Web search was not successful. Provide helpful responses based on your knowledge.`;
		}
		systemPrompt += `Provide clear, helpful responses. Format in markdown when appropriate.`;

		const openRouterBody = {
			model: "google/gemini-flash-1.5",
			messages: [{ role: "system", content: systemPrompt }, ...messageHistory],
			temperature: 0.7,
			max_tokens: 4000,
			// Caching is implicit for Gemini models on OpenRouter
		};

		let responseContent = "";
		let reasoning = "";
		try {
			for await (const chunk of streamOpenRouter(openRouterBody)) {
				if (chunk.choices[0].delta.content) {
					responseContent += chunk.choices[0].delta.content;
					await ctx.runMutation(internal.messages.updateMessage, {
						messageId: args.assistantMessageId,
						streamedContent: responseContent,
					});
				}
				if (chunk.choices[0].delta.reasoning) {
					reasoning += chunk.choices[0].delta.reasoning;
					await ctx.runMutation(internal.messages.updateMessage, {
						messageId: args.assistantMessageId,
						thinking: reasoning,
					});
				}
			}
		} catch (error) {
			console.error("OpenRouter streaming failed:", error);
			responseContent =
				"I apologize, but I couldn't generate a response. Please try again.";
			errorDetails.push(
				`AI generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		// 8. Finalize the assistant message
		await ctx.runMutation(internal.messages.updateMessage, {
			messageId: args.assistantMessageId,
			content: responseContent,
			isStreaming: false,
			thinking: null, // Clear thinking state
			reasoning,
		});
	},
});
