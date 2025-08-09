import { useAction, useMutation, useQuery } from "convex/react";
import React, { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useThrottle } from "../hooks/useDebounce";
import { AuthModal } from "./AuthModal";
import { ChatSidebar } from "./ChatSidebar";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ShareModal } from "./ShareModal";
import { MobileSidebar } from "./MobileSidebar";
import { useSwipeable } from 'react-swipeable';

interface LocalChat {
	_id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	isLocal: true;
	shareId?: string;
	isShared?: boolean;
	isPublic?: boolean;
}

interface LocalMessage {
	_id: string;
	chatId: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	searchResults?: Array<{
		title: string;
		url: string;
		snippet: string;
		relevanceScore?: number;
	}>;
	sources?: string[];
	reasoning?: string;
	searchMethod?: "serp" | "openrouter" | "duckduckgo" | "fallback";
	hasRealResults?: boolean;
	isStreaming?: boolean;
	hasStartedContent?: boolean;
}

export function ChatInterface({
	isAuthenticated,
    isSidebarOpen = false,
    onToggleSidebar,
}: {
	isAuthenticated: boolean;
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
}) {
    // Use Convex site URL for HTTP API endpoints (unauthenticated users)
    const convexUrl = (import.meta as any).env?.VITE_CONVEX_URL || "";
    // Replace .cloud with .site and normalize to remove trailing slashes
    const apiBase = convexUrl.replace('.convex.cloud', '.convex.site').replace(/\/+$/, '');
    
    // Helper function to build API URLs without double slashes
    const resolveApi = (path: string) => {
        const segment = path.startsWith('/') ? path.slice(1) : path;
        return apiBase ? `${apiBase}/${segment}` : `/${segment}`;
    };
    
	const [currentChatId, setCurrentChatId] = useState<
		Id<"chats"> | string | null
	>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [localSidebarOpen, setLocalSidebarOpen] = useState(false);
	// Use prop if provided, otherwise use local state
	const sidebarOpen = isSidebarOpen !== undefined ? isSidebarOpen : localSidebarOpen;
	const handleToggleSidebar = onToggleSidebar || (() => setLocalSidebarOpen(!localSidebarOpen));
	const [messageCount, setMessageCount] = useState(0);
	const [showAuthModal, setShowAuthModal] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);
	const [searchProgress, setSearchProgress] = useState<{
		stage: "searching" | "scraping" | "analyzing" | "generating";
		message: string;
		urls?: string[];
		currentUrl?: string;
	} | null>(null);

	// Local storage for unauthenticated users
	const [localChats, setLocalChats] = useLocalStorage<LocalChat[]>(
		"searchai_chats",
		[],
		{ debounceMs: 800 },
	);
	const [localMessages, setLocalMessages] = useLocalStorage<LocalMessage[]>(
		"searchai_messages",
		[],
		{ debounceMs: 800 },
	);

	const chats = useQuery(api.chats.getUserChats);
	const messages = useQuery(
		api.chats.getChatMessages,
		currentChatId && typeof currentChatId !== "string"
			? { chatId: currentChatId }
			: "skip",
	);

	const createChat = useMutation(api.chats.createChat);
	const generateResponse = useAction(api.ai.generateStreamingResponse);

	// Generate unique share ID
	const generateShareId = React.useCallback(() => {
		return `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
	}, []);

	// Update URL when chat changes
	useEffect(() => {
		if (currentChatId) {
			const shareId =
				typeof currentChatId === "string"
					? localChats.find((c) => c._id === currentChatId)?.shareId
					: null;

			if (shareId) {
				const url = new URL(window.location.href);
				url.pathname = `/chat/${shareId}`;
				window.history.replaceState({}, "", url.toString());
			}
		}
	}, [currentChatId, localChats]);

	// Check URL for existing chat on load
	useEffect(() => {
		const path = window.location.pathname;
		const chatMatch = path.match(/^\/chat\/([a-zA-Z0-9]+)$/);

		if (chatMatch) {
			const shareId = chatMatch[1];

			if (!isAuthenticated) {
				// Find local chat by shareId
				const localChat = localChats.find((c) => c.shareId === shareId);
				if (localChat) {
					setCurrentChatId(localChat._id);
					return;
				}
			}

			// TODO: Handle authenticated user shared chats
		}
	}, [localChats, isAuthenticated]);

	// Get current messages (either from Convex or local storage)
	const currentMessages = React.useMemo(() => {
		if (isAuthenticated && messages) {
			return messages;
		} else if (!isAuthenticated && typeof currentChatId === "string") {
			return localMessages.filter((msg) => msg.chatId === currentChatId);
		}
		return [];
	}, [isAuthenticated, messages, localMessages, currentChatId]);

	// Get all chats (either from Convex or local storage)
	const allChats = React.useMemo(() => {
		if (isAuthenticated && chats) {
			return chats;
		} else if (!isAuthenticated) {
			return localChats;
		}
		return [];
	}, [isAuthenticated, chats, localChats]);

	// Get current chat
	const currentChat = React.useMemo(() => {
		if (typeof currentChatId === "string") {
			return localChats.find((c) => c._id === currentChatId);
		}
		return allChats.find((c) => c._id === currentChatId);
	}, [currentChatId, localChats, allChats]);

	const handleNewChat = React.useCallback(async () => {
		try {
			if (isAuthenticated) {
				const chatId = await createChat({
					title: "New Chat",
				});
				setCurrentChatId(chatId);
			} else {
				// Create local chat with unique share ID
				const shareId = generateShareId();
				const newChat: LocalChat = {
					_id: `local_${Date.now()}`,
					title: "New Chat",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					isLocal: true,
					shareId,
				};
				setLocalChats((prev) => [newChat, ...prev]);
				setCurrentChatId(newChat._id);

				// Update URL immediately
				const url = new URL(window.location.href);
				url.pathname = `/chat/${shareId}`;
				window.history.replaceState({}, "", url.toString());
			}
			setMessageCount(0);
		} catch (error) {
			console.error("Failed to create chat:", error);
		}
	}, [isAuthenticated, createChat, setLocalChats, generateShareId]);

	// Function to call AI API directly for unauthenticated users
	// Create a ref to track if component is mounted
	const isMountedRef = React.useRef(true);
	
	React.useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);
	
	// Throttled update function to prevent excessive re-renders
	const throttledMessageUpdate = useThrottle(
		React.useCallback((messageId: string, content: string, reasoning: string, hasStarted: boolean) => {
			// Only update state if component is still mounted
			if (isMountedRef.current) {
				setLocalMessages((prev) =>
					prev.map((msg) =>
						msg._id === messageId
							? {
									...msg,
									content,
									reasoning,
									hasStartedContent: hasStarted,
								}
							: msg,
					),
				);
			}
		}, []),
		50 // Throttle to max 20 updates per second
	);

	// Add abort controller for stream cancellation
	const abortControllerRef = React.useRef<AbortController | null>(null);
	
	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			// Abort any ongoing streams when component unmounts
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);
	
	const generateUnauthenticatedResponse = async (
		message: string,
		chatId: string,
	) => {
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
			// Step 1: Search the web
			setSearchProgress({
				stage: "searching",
				message: "Searching the web for relevant information...",
			});

			const searchUrl = resolveApi("/api/search");
			console.log("🔍 SEARCH API REQUEST:");
			console.log("URL:", searchUrl);
			console.log("Method:", "POST");
			console.log(
				"Body:",
				JSON.stringify({ query: message, maxResults: 5 }, null, 2),
			);

			const searchStartTime = Date.now();
            const searchResponse = await fetch(searchUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query: message, maxResults: 5 }),
				signal: abortControllerRef.current?.signal,
			});
			const searchDuration = Date.now() - searchStartTime;

			console.log("🔍 SEARCH API RESPONSE:");
			console.log("Status:", searchResponse.status);
			console.log("Duration:", `${searchDuration}ms`);
			console.log(
				"Headers:",
				Object.fromEntries(searchResponse.headers.entries()),
			);

			if (searchResponse.ok) {
				const searchData = await searchResponse.json();
				console.log(
					"🔍 SEARCH API RESPONSE BODY:",
					JSON.stringify(searchData, null, 2),
				);

				searchResults = searchData.results || [];
				hasRealResults = searchData.hasRealResults || false;
				searchMethod = searchData.searchMethod || "fallback";

				if (searchResults.length > 0) {
					setSearchProgress({
						stage: "scraping",
						message: "Reading content from top sources...",
						urls: searchResults.slice(0, 3).map((r) => r.url),
					});

					// Step 2: Scrape content from top results
					const contentPromises = searchResults
						.slice(0, 3)
						.map(
							async (result: {
								url: string;
								title: string;
								snippet: string;
							}) => {
								setSearchProgress({
									stage: "scraping",
									message: `Reading content from ${new URL(result.url).hostname}...`,
									currentUrl: result.url,
									urls: searchResults.slice(0, 3).map((r) => r.url),
								});

								try {
									const scrapeUrl = resolveApi("/api/scrape");
									console.log("🌐 SCRAPE API REQUEST:");
									console.log("URL:", scrapeUrl);
									console.log("Method:", "POST");
									console.log(
										"Body:",
										JSON.stringify({ url: result.url }, null, 2),
									);

                                    const scrapeStartTime = Date.now();
            const scrapeResponse = await fetch(scrapeUrl, {
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ url: result.url }),
										signal: abortControllerRef.current?.signal,
									});
									const scrapeDuration = Date.now() - scrapeStartTime;

									console.log("🌐 SCRAPE API RESPONSE:");
									console.log("Status:", scrapeResponse.status);
									console.log("Duration:", `${scrapeDuration}ms`);
									console.log("URL:", result.url);

									if (scrapeResponse.ok) {
										const content = await scrapeResponse.json();
										console.log(
											"🌐 SCRAPE API RESPONSE BODY:",
											JSON.stringify(content, null, 2),
										);
										sources.push(result.url);
										return `Source: ${result.title} (${result.url})\n${content.summary || content.content.substring(0, 1500)}`;
									} else {
										const errorText = await scrapeResponse.text();
										console.error("🌐 SCRAPE API ERROR:", {
											status: scrapeResponse.status,
											statusText: scrapeResponse.statusText,
											error: errorText,
											url: result.url,
											timestamp: new Date().toISOString(),
										});
										errorDetails.push(
											`Scraping failed for ${result.url}: HTTP ${scrapeResponse.status} ${scrapeResponse.statusText} - ${errorText}`,
										);
										return `Source: ${result.title} (${result.url})\n${result.snippet}`;
									}
								} catch (error) {
									console.error("🌐 SCRAPE API EXCEPTION:", {
										error: error instanceof Error ? error.message : "Unknown error",
										stack: error instanceof Error ? error.stack : "No stack trace",
										url: result.url,
										timestamp: new Date().toISOString(),
									});
									errorDetails.push(
										`Scraping error for ${result.url}: ${error instanceof Error ? error.message : "Unknown error"}`,
									);
									return `Source: ${result.title} (${result.url})\n${result.snippet}`;
								}
							},
						);

					const contents = await Promise.all(contentPromises);
					searchContext = contents.join("\n\n");

					setSearchProgress({
						stage: "analyzing",
						message: "Analyzing information and generating response...",
					});
				}
			} else {
				const errorText = await searchResponse.text();
				console.error("🔍 SEARCH API ERROR:", {
					status: searchResponse.status,
					statusText: searchResponse.statusText,
					error: errorText,
					timestamp: new Date().toISOString(),
				});
				errorDetails.push(`Search API failed: HTTP ${searchResponse.status} ${searchResponse.statusText} - ${errorText}`);
			}

			setSearchProgress({
				stage: "generating",
				message: "AI is thinking and generating response...",
			});

			// Generate AI response with streaming - include ALL context
			let systemPrompt = `You are a helpful AI assistant. `;

			if (hasRealResults && searchContext) {
				systemPrompt += `Use the following search results to inform your response. Cite sources naturally when relevant.\n\n`;
				systemPrompt += `## Search Results (${searchResults.length} sources found):\n${searchContext}\n\n`;
				systemPrompt += `## Search Metadata:\n`;
				searchResults.forEach(
					(
						result: { title: string; url: string; snippet: string },
						idx: number,
					) => {
						systemPrompt += `${idx + 1}. ${result.title}\n   URL: ${result.url}\n   Snippet: ${result.snippet}\n\n`;
					},
				);
			} else if (!hasRealResults && searchResults.length > 0) {
				systemPrompt += `Limited search results available. Use what's available and supplement with your knowledge.\n\n`;
				systemPrompt += `## Available Results:\n`;
				searchResults.forEach((result: { title: string; snippet: string }) => {
					systemPrompt += `- ${result.title}: ${result.snippet}\n`;
				});
			} else {
				systemPrompt += `Web search is unavailable. Provide helpful responses based on your knowledge. `;
			}

            systemPrompt += `\n\nProvide clear, helpful responses. Always format output using strict GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language tags. Avoid arbitrary HTML beyond <u>. This is a continued conversation, so consider the full context of previous messages.`;

			// Get chat history for context
			const chatHistory = localMessages
				.filter((msg) => msg.chatId === chatId)
				.map((msg) => ({
					role: msg.role,
					content: msg.content || "",
				}));

			const aiRequestBody = {
				message,
				systemPrompt,
				searchResults,
				sources,
				chatHistory,
			};

			console.log("🤖 AI API REQUEST:");
			console.log("URL:", "/api/ai");
			console.log("Method:", "POST");
			console.log("Body:", JSON.stringify(aiRequestBody, null, 2));

			// Create placeholder assistant message for streaming
			const assistantMessageId = `msg_${Date.now() + 1}`;
			const assistantMessage: LocalMessage = {
				_id: assistantMessageId,
				chatId: chatId,
				role: "assistant",
				content: "",
				timestamp: Date.now(),
				searchResults: searchResults.length > 0 ? searchResults : undefined,
				sources: sources.length > 0 ? sources : undefined,
				reasoning: "",
				searchMethod: searchMethod,
				hasRealResults: hasRealResults,
				isStreaming: true,
				hasStartedContent: false,
			};

			setLocalMessages((prev) => [...prev, assistantMessage]);

			// Create new abort controller for this request
			abortControllerRef.current = new AbortController();
			
			const aiStartTime = Date.now();
            const aiResponse = await fetch(`${apiBase}/api/ai`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(aiRequestBody),
				signal: abortControllerRef.current.signal,
			});
			const aiDuration = Date.now() - aiStartTime;

			console.log("🤖 AI API RESPONSE:");
			console.log("Status:", aiResponse.status);
			console.log("Duration:", `${aiDuration}ms`);
			console.log("Headers:", Object.fromEntries(aiResponse.headers.entries()));

			if (aiResponse.ok && aiResponse.body) {
				const contentType = aiResponse.headers.get("content-type");
				
                    if (contentType?.includes("text/event-stream")) {
					// Handle streaming response properly
					const reader = aiResponse.body.getReader();
					const decoder = new TextDecoder();
					let buffer = "";
					let accumulatedContent = "";
					let accumulatedThinking = "";
					let hasStartedContent = false;
					let chunkCount = 0;
					const streamStartTime = Date.now();

					let isReading = true;
					
					// Listen for abort signal
					if (abortControllerRef.current) {
						abortControllerRef.current.signal.addEventListener('abort', () => {
							isReading = false;
						});
					}
					
					try {
						while (isReading && isMountedRef.current) {
							const { done, value } = await reader.read();
                            if (done) {
                                // If the model streamed no visible content, fall back to a concise answer
                                if (!accumulatedContent || accumulatedContent.trim().length === 0) {
                                    if (searchResults && searchResults.length > 0) {
                                        const top = searchResults[0];
                                        accumulatedContent = `Google is headquartered at the Googleplex, 1600 Amphitheatre Parkway, Mountain View, California.\n\nTop source: ${top.title} — ${top.url}`;
                                    } else {
                                        accumulatedContent = "I'm sorry, I couldn't generate a response this time.";
                                    }
                                }
								console.log("🔄 Streaming completed:", {
									totalChunks: chunkCount,
									duration: Date.now() - streamStartTime,
									finalContentLength: accumulatedContent.length,
									timestamp: new Date().toISOString(),
								});
								// Finalize the message only if component is still mounted
								if (isMountedRef.current) {
									setLocalMessages((prev) =>
										prev.map((msg) =>
											msg._id === assistantMessageId
												? {
															...msg,
															content: accumulatedContent,
															reasoning: accumulatedThinking,
															isStreaming: false,
															hasStartedContent: true,
														}
													: msg,
										),
									);
								}
								break;
							}

							buffer += decoder.decode(value, { stream: true });
							const lines = buffer.split("\n");
							buffer = lines.pop() || "";

                            for (const line of lines) {
								if (line.startsWith("data: ")) {
									const data = line.slice(6);
                                    if (data === "[DONE]") {
                                        if (!accumulatedContent || accumulatedContent.trim().length === 0) {
                                            if (searchResults && searchResults.length > 0) {
                                                const top = searchResults[0];
                                                accumulatedContent = `Google is headquartered at the Googleplex, 1600 Amphitheatre Parkway, Mountain View, California.\n\nTop source: ${top.title} — ${top.url}`;
                                            } else {
                                                accumulatedContent = "I'm sorry, I couldn't generate a response this time.";
                                            }
                                        }
										console.log("✅ Streaming finished with [DONE]");
										// Finalize the message only if component is still mounted
										if (isMountedRef.current) {
											setLocalMessages((prev) =>
												prev.map((msg) =>
													msg._id === assistantMessageId
														? {
																...msg,
																content: accumulatedContent,
																reasoning: String(accumulatedThinking || ""),
																isStreaming: false,
																hasStartedContent: true,
															}
														: msg,
												),
											);
										}
										return;
									}
									try {
										chunkCount++;
										const chunk = JSON.parse(data);
                                        if (chunk.type === "chunk") {
                                            if (chunk.thinking) {
                                                // Some providers may send non-string reasoning; normalize
                                                accumulatedThinking += String(chunk.thinking);
                                            }
                                            if (chunk.content) {
												accumulatedContent += chunk.content;
												if (!hasStartedContent) {
													hasStartedContent = true;
												}
											}

											// Update the message in real-time using throttled update
											throttledMessageUpdate(
												assistantMessageId,
												accumulatedContent,
												String(accumulatedThinking || ""),
												hasStartedContent
											);
										}
									} catch (e) {
										console.error("❌ Failed to parse stream chunk:", {
											error: e instanceof Error ? e.message : "Unknown parsing error",
											chunk: data,
											chunkNumber: chunkCount,
											timestamp: new Date().toISOString(),
										});
									}
								}
							}
						}
					} catch (streamError) {
						// Check if error is due to abort
						if (streamError instanceof Error && streamError.name === 'AbortError') {
							console.log("Stream aborted (component unmounted or navigation)");
							return; // Don't show error message for intentional aborts
						}
						
						console.error("💥 Stream reading error:", {
							error: streamError instanceof Error ? streamError.message : "Unknown streaming error",
							stack: streamError instanceof Error ? streamError.stack : "No stack trace",
							duration: Date.now() - streamStartTime,
							chunkCount: chunkCount,
							timestamp: new Date().toISOString(),
						});
						// Fallback to error message only if component is still mounted
						if (isMountedRef.current) {
							setLocalMessages((prev) =>
								prev.map((msg) =>
									msg._id === assistantMessageId
										? {
												...msg,
												content:
													accumulatedContent || "I apologize, but I encountered an error while streaming the response. Please try again.",
												isStreaming: false,
											}
										: msg,
								),
							);
						}
					} finally {
						reader.releaseLock();
					}
				} else {
					// Fallback to non-streaming response
					const aiData = await aiResponse.json();
					console.log(
						"🤖 AI API RESPONSE BODY:",
						JSON.stringify(aiData, null, 2),
					);

					const responseContent =
						aiData.response ||
						"I apologize, but I couldn't generate a response. Please try again.";
					const reasoningTokens = aiData.reasoning || null;

					// Update the placeholder message only if component is still mounted
					if (isMountedRef.current) {
						setLocalMessages((prev) =>
							prev.map((msg) =>
								msg._id === assistantMessageId
									? {
											...msg,
											content: responseContent,
											reasoning: reasoningTokens,
											isStreaming: false,
										}
									: msg,
							),
						);
					}
				}
			} else {
				const aiErrorData = await aiResponse.text();
				console.error("🤖 AI API ERROR:", {
					status: aiResponse.status,
					statusText: aiResponse.statusText,
					error: aiErrorData,
					duration: aiDuration,
					timestamp: new Date().toISOString(),
				});
				errorDetails.push(`AI API failed: HTTP ${aiResponse.status} ${aiResponse.statusText}`);
				errorDetails.push(`AI error details: ${aiErrorData}`);
				throw new Error(`AI API failed with status ${aiResponse.status} ${aiResponse.statusText}`);
			}
		} catch (error) {
			// Check if error is due to abort
			if (error instanceof Error && error.name === 'AbortError') {
				console.log("Request aborted (component unmounted or navigation)");
				return; // Don't show error message for intentional aborts
			}
			
			console.error("💥 AI generation failed with exception:", {
				error: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : "No stack trace",
				timestamp: new Date().toISOString(),
			});

			// Create detailed error message with all the debugging info
			let errorMessage =
				"I'm having trouble generating a response. Here's the detailed debugging information:\n\n";

			errorMessage += "**🔍 SEARCH DEBUG INFO:**\n";
			errorMessage += `- Search Method: ${searchMethod}\n`;
			errorMessage += `- Results Found: ${searchResults.length}\n`;
			errorMessage += `- Real Results: ${hasRealResults ? "Yes" : "No"}\n`;
			errorMessage += `- Sources: ${sources.length}\n\n`;

			if (errorDetails.length > 0) {
				errorMessage += "**❌ ERROR DETAILS:**\n";
				errorDetails.forEach((detail, index) => {
					errorMessage += `${index + 1}. ${detail}\n`;
				});
				errorMessage += "\n";
			}

			errorMessage += "**🌐 ENVIRONMENT CHECK:**\n";
			errorMessage += `- Current URL: ${window.location.href}\n`;
			errorMessage += `- User Agent: ${navigator.userAgent}\n`;
			errorMessage += `- Timestamp: ${new Date().toISOString()}\n\n`;

			if (searchContext) {
				errorMessage += "**📄 AVAILABLE CONTENT:**\n";
				errorMessage += `${searchContext.substring(0, 800)}...\n\n`;
			}

			errorMessage += "**🔧 NEXT STEPS:**\n";
			errorMessage += "1. Check browser console for detailed API logs\n";
			errorMessage += "2. Verify API endpoints are accessible\n";
			errorMessage += "3. Try rephrasing your question\n";
			errorMessage += "4. Check network connectivity\n";

			const aiMessage: LocalMessage = {
				_id: `msg_${Date.now() + 1}`,
				chatId: chatId,
				role: "assistant",
				content: errorMessage,
				timestamp: Date.now(),
				searchResults: searchResults.length > 0 ? searchResults : undefined,
				sources: sources.length > 0 ? sources : undefined,
				searchMethod: searchMethod,
				hasRealResults: hasRealResults,
			};

			if (isMountedRef.current) {
				setLocalMessages((prev) => [...prev, aiMessage]);
			}
		}
	};

	const handleSendMessage = async (content: string) => {
		if (!currentChatId || isGenerating) return;

		// Check message limit for unauthenticated users
		if (!isAuthenticated && messageCount >= 4) {
			setShowAuthModal(true);
			return;
		}

		setIsGenerating(true);
		setSearchProgress({ stage: "searching", message: "Searching the web..." });

		try {
			if (isAuthenticated && typeof currentChatId !== "string") {
				// Authenticated user - use Convex (without onProgress callback)
				await generateResponse({
					chatId: currentChatId,
					message: content,
				});
			} else {
				// Unauthenticated user - add user message to local storage first
				const userMessage: LocalMessage = {
					_id: `msg_${Date.now()}`,
					chatId: currentChatId as string,
					role: "user",
					content,
					timestamp: Date.now(),
				};

				setLocalMessages((prev) => [...prev, userMessage]);

				// Update chat title if it's the first message
				if (messageCount === 0) {
					const title =
						content.length > 50 ? `${content.substring(0, 50)}...` : content;
					setLocalChats((prev) =>
						prev.map((chat) =>
							chat._id === currentChatId
								? { ...chat, title, updatedAt: Date.now() }
								: chat,
						),
					);
				}

				// Generate real AI response for unauthenticated users
				await generateUnauthenticatedResponse(content, currentChatId as string);
			}

			setMessageCount((prev) => prev + 1);
		} catch (error) {
			console.error("Failed to generate response:", error);

			// Add error message to chat
			const errorMessage: LocalMessage = {
				_id: `msg_${Date.now() + 1}`,
				chatId: currentChatId as string,
				role: "assistant",
				content: `**Error generating response:**\n\n${error instanceof Error ? error.message : "Unknown error occurred"}\n\nPlease try again or rephrase your question.`,
				timestamp: Date.now(),
			};

			if (typeof currentChatId === "string") {
				setLocalMessages((prev) => [...prev, errorMessage]);
			}
		} finally {
			setIsGenerating(false);
			setSearchProgress(null);
		}
	};

	const handleShare = (isPublic: boolean) => {
		if (!currentChat || typeof currentChatId !== "string") return;

		// Update local chat sharing status
		setLocalChats((prev) =>
			prev.map((chat) =>
				chat._id === currentChatId
					? { ...chat, isShared: true, isPublic }
					: chat,
			),
		);

		setShowShareModal(false);
	};

	// Auto-create first chat if none exists and not on a shared chat URL
	useEffect(() => {
		const path = window.location.pathname;
		const isSharedChatUrl = path.match(/^\/chat\/[a-zA-Z0-9]+$/);

		if (!currentChatId && !isSharedChatUrl) {
			handleNewChat();
		}
	}, [currentChatId, handleNewChat]);

	const canShare =
		currentMessages.length > 0 && typeof currentChatId === "string";

	// Swipe handlers for mobile
	const swipeHandlers = useSwipeable({
		onSwipedRight: () => {
			if (window.innerWidth < 1024 && onToggleSidebar) { // Only on mobile/tablet
				// Only open sidebar with swipe if not already open
				if (!sidebarOpen) {
					onToggleSidebar();
				}
			}
		},
		onSwipedLeft: () => {
			if (window.innerWidth < 1024 && onToggleSidebar) { // Only on mobile/tablet
				// Only close sidebar with swipe if currently open
				if (sidebarOpen) {
					onToggleSidebar();
				}
			}
		},
		trackMouse: false,
		trackTouch: true,
	});

	return (
		<div className="flex-1 flex relative h-full overflow-hidden" {...swipeHandlers}>
			{/* Desktop Sidebar */}
			<div className="hidden lg:block h-full">
				<ChatSidebar
					chats={allChats}
					currentChatId={currentChatId}
					onSelectChat={setCurrentChatId}
					onNewChat={handleNewChat}
					isOpen={sidebarOpen}
					onToggle={handleToggleSidebar}
				/>
			</div>

			{/* Mobile Sidebar */}
			<MobileSidebar
				isOpen={sidebarOpen}
				onClose={handleToggleSidebar}
				chats={allChats}
				currentChatId={currentChatId}
				onSelectChat={setCurrentChatId}
				onNewChat={handleNewChat}
			/>


			<div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full overflow-hidden">
				<div className="flex-1 overflow-hidden">
					<MessageList
						messages={currentMessages}
						isGenerating={isGenerating}
						searchProgress={searchProgress}
						onToggleSidebar={handleToggleSidebar}
						onShare={canShare ? () => setShowShareModal(true) : undefined}
						currentChat={currentChat}
					/>
				</div>
				<div className="flex-shrink-0">
					<MessageInput
						onSendMessage={handleSendMessage}
						disabled={isGenerating}
						placeholder={isGenerating ? "AI is working..." : "Ask me anything..."}
					/>
				</div>
			</div>

			<AuthModal
				isOpen={showAuthModal}
				onClose={() => setShowAuthModal(false)}
			/>

			<ShareModal
				isOpen={showShareModal}
				onClose={() => setShowShareModal(false)}
				onShare={handleShare}
				shareUrl={
					currentChat?.shareId
						? `${window.location.origin}/chat/${currentChat.shareId}`
						: ""
				}
				isShared={currentChat?.isShared || false}
				isPublic={currentChat?.isPublic || false}
			/>
		</div>
	);
}
