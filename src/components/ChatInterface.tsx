/**
 * Main chat interface with authentication modals and message handling
 * - Orchestrates chats/messages for authenticated and anonymous users
 * - Handles sign-in/sign-up modal separation and switching
 * - Streams AI responses (Convex for auth, HTTP API for anonymous)
 * - Manages local storage for unauthenticated user data
 * - Implements topic change detection and new chat suggestions
 */

import { useAction, useMutation, useQuery } from "convex/react";
import React, { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useThrottle, useDebounce } from "../hooks/useDebounce";
import { logger } from "../lib/logger";
import { ChatSidebar } from "./ChatSidebar";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ShareModal } from "./ShareModal";
import { MobileSidebar } from "./MobileSidebar";
import { FollowUpPrompt } from "./FollowUpPrompt";
import { SignInModal } from "./SignInModal";
import { SignUpModal } from "./SignUpModal";
import { useSwipeable } from 'react-swipeable';

// Topic-change detection constants
const TOPIC_CHANGE_SIMILARITY_THRESHOLD = 0.2;
const TOPIC_CHANGE_MIN_WORD_LENGTH = 3;
const TOPIC_CHANGE_INDICATORS = [
  /^(now|next|also|another|different|switch|change|new question)/i,
  /^(what about|how about|tell me about)/i,
  /^(unrelated|separate|different topic)/i,
];
// Planner cooldown (ms)
const CHAT_COOLDOWN_MS = 20_000;

interface LocalChat {
	_id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	isLocal: true;
	shareId?: string;
	isShared?: boolean;
	isPublic?: boolean;
	privacy?: "private" | "shared" | "public";
	publicId?: string;
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
    chatId: propChatId,
    shareId: propShareId,
    publicId: propPublicId,
}: {
 isAuthenticated: boolean;
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
    chatId?: string;
    shareId?: string;
    publicId?: string;
}) {
    const convexUrl = (import.meta as any).env?.VITE_CONVEX_URL || "";
    const apiBase = convexUrl.replace('.convex.cloud', '.convex.site').replace(/\/+$/, '');
    
    const resolveApi = (path: string) => {
        const segment = path.startsWith('/') ? path.slice(1) : path;
        return apiBase ? `${apiBase}/${segment}` : `/${segment}`;
    };
    
 const [currentChatId, setCurrentChatId] = useState<Id<"chats"> | string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [localSidebarOpen, setLocalSidebarOpen] = useState(false);
	// Use prop if provided, otherwise use local state
	const sidebarOpen = isSidebarOpen !== undefined ? isSidebarOpen : localSidebarOpen;
	const handleToggleSidebar = onToggleSidebar || (() => setLocalSidebarOpen(!localSidebarOpen));
	const [messageCount, setMessageCount] = useState(0);
	const [showSignUpModal, setShowSignUpModal] = useState(false);
	const [showSignInModal, setShowSignInModal] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);
	const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false);
	const [pendingMessage, setPendingMessage] = useState<string>("");
	const [plannerHint, setPlannerHint] = useState<{ reason?: string; confidence?: number } | undefined>(undefined);
	const [lastPlannerCallAtByChat, setLastPlannerCallAtByChat] = useState<Record<string, number>>({});
  const [lastDraftSeen, setLastDraftSeen] = useState<string>("");
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
	const chatByOpaqueId = useQuery(api.chats.getChatByOpaqueId, propChatId ? { chatId: propChatId } : "skip");
	const chatByShareId = useQuery(api.chats.getChatByShareId, propShareId ? { shareId: propShareId } : "skip");
	const chatByPublicId = useQuery(api.chats.getChatByPublicId, propPublicId ? { publicId: propPublicId } : "skip");
	
	const messages = useQuery(
		api.chats.getChatMessages,
		currentChatId && typeof currentChatId !== "string"
			? { chatId: currentChatId }
			: "skip",
	);

	const createChat = useMutation(api.chats.createChat);
	const updateChatPrivacy = useMutation(api.chats.updateChatPrivacy);
	 const generateResponse = useAction(api.ai.generateStreamingResponse);
  const planSearch = useAction(api.search.planSearch);
	 const recordClientMetric = useAction(api.search.recordClientMetric);
  const summarizeRecentAction = useAction(api.chats.summarizeRecentAction);
  // no-op placeholder (removed summarizeRecent direct usage)

	/**
	 * Generate unique share ID
	 * - Random alphanumeric string
	 * - Used for shareable chat URLs
	 */
	const generateShareId = React.useCallback(() => {
		return `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
	}, []);

	/**
	 * Detect topic change between messages
	 * - Uses lexical similarity (Jaccard index)
	 * - Checks topic change indicators  
	 * - Returns true if similarity < 0.2
	 * @param newMessage - New message text
	 * @param previousMessages - Chat history
	 * @returns true if topic changed significantly
	 */
	const isTopicChange = React.useCallback((newMessage: string, previousMessages: LocalMessage[]) => {
		// Don't prompt if there are no previous messages or only one exchange
		if (previousMessages.length < 2) return false;
		
		// Get the last user message (if any)
		const lastUserMessage = [...previousMessages].reverse().find(m => m.role === 'user');
		if (!lastUserMessage) return false;
		
		// Simple heuristic: Check if the new message has very different keywords
		// or is asking about something completely different
		const newWords = new Set(newMessage.toLowerCase().split(/\s+/).filter(w => w.length > TOPIC_CHANGE_MIN_WORD_LENGTH));
		const lastWords = new Set(lastUserMessage.content.toLowerCase().split(/\s+/).filter(w => w.length > TOPIC_CHANGE_MIN_WORD_LENGTH));
		
		// Calculate overlap
		const intersection = new Set([...newWords].filter(x => lastWords.has(x)));
		const similarity = intersection.size / Math.max(newWords.size, lastWords.size);
		
		// If similarity is very low, it's likely a topic change
		// Also check for explicit signals of new topics
		const hasIndicator = TOPIC_CHANGE_INDICATORS.some(pattern => pattern.test(newMessage));
		
		return similarity < TOPIC_CHANGE_SIMILARITY_THRESHOLD || hasIndicator;
	}, []);

	// Get all chats (either from Convex or local storage)
	const allChats = React.useMemo(() => {
		if (isAuthenticated && chats) {
			return chats;
		} else if (!isAuthenticated) {
			return localChats;
		}
		return [];
	}, [isAuthenticated, chats, localChats]);

	// Get current messages (either from Convex or local storage)
	const currentMessages = React.useMemo(() => {
		if (isAuthenticated && messages) {
			return messages;
		} else if (!isAuthenticated && typeof currentChatId === "string") {
			return localMessages.filter((msg) => msg.chatId === currentChatId);
		}
		return [];
	}, [isAuthenticated, messages, localMessages, currentChatId]);

  // Build user message history for terminal-like navigation (oldest -> newest)
  const userHistory = React.useMemo(() => {
    const list = currentMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    // De-duplicate consecutive duplicates
    const deduped: string[] = [];
    for (const s of list) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== s) deduped.push(s);
    }
    return deduped;
  }, [currentMessages]);

	// Update URL when chat changes
	useEffect(() => {
		if (chatByOpaqueId) {
			setCurrentChatId(chatByOpaqueId._id);
		} else if (chatByShareId) {
			setCurrentChatId(chatByShareId._id);
		} else if (chatByPublicId) {
			setCurrentChatId(chatByPublicId._id);
		} else if (!isAuthenticated && propChatId) {
			// For unauthenticated users, check if the chatId from URL matches a local chat
			const localChat = localChats.find(chat => chat._id === propChatId);
			if (localChat) {
				setCurrentChatId(localChat._id);
			}
		} else if (!isAuthenticated && propShareId) {
			// For unauthenticated users, check if the shareId from URL matches a local chat
			const localChat = localChats.find(chat => chat.shareId === propShareId);
			if (localChat) {
				setCurrentChatId(localChat._id);
			}
		} else if (!isAuthenticated && propPublicId) {
			// For unauthenticated users, check if the publicId from URL matches a local chat
			const localChat = localChats.find(chat => chat.publicId === propPublicId);
			if (localChat) {
				setCurrentChatId(localChat._id);
			}
		}
	}, [chatByOpaqueId, chatByShareId, chatByPublicId, isAuthenticated, propChatId, propShareId, propPublicId, localChats]);

	useEffect(() => {
		const chat = allChats.find(c => c._id === currentChatId);
		if (chat) {
			let path = '';
			if (chat.privacy === 'public' && chat.publicId) {
				path = `/p/${chat.publicId}`;
			} else if (chat.privacy === 'shared' && chat.shareId) {
				path = `/s/${chat.shareId}`;
			} else {
				path = `/chat/${chat._id}`;
			}
			if (path !== window.location.pathname) {
				window.history.pushState({}, '', path);
			}
		}
	}, [currentChatId, allChats]);

	useEffect(() => {
		const chat = allChats.find(c => c._id === currentChatId);
		const metaRobots = document.querySelector('meta[name="robots"]');
		if (chat && metaRobots) {
			if (chat.privacy === 'public') {
				metaRobots.setAttribute('content', 'index, follow');
			} else {
				metaRobots.setAttribute('content', 'noindex, nofollow');
			}
		}
	}, [currentChatId, allChats]);

	// Get current chat
	const currentChat = React.useMemo(() => {
		if (typeof currentChatId === "string") {
			return localChats.find((c) => c._id === currentChatId);
		}
		return allChats.find((c) => c._id === currentChatId);
	}, [currentChatId, localChats, allChats]);

	/**
	 * Create new chat
	 * - Auth: creates via Convex mutation
	 * - Anon: creates local with share ID
	 * - Updates URL for shareable chats
	 */
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
					publicId: generateShareId(), // Also generate a public ID
					privacy: 'private',
				};
				setLocalChats((prev) => [newChat, ...prev]);
				setCurrentChatId(newChat._id);
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
	
	/**
	 * Throttled message update
	 * - Limits updates to 20/sec max
	 * - Prevents UI jank during streaming
	 * - Only updates if mounted
	 */
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
	
	/**
	 * Generate AI response for anon users
	 * - Calls HTTP endpoints (search/scrape/ai)
	 * - Streams response via SSE
	 * - Updates local storage
	 * - Handles errors with detailed debug info
	 * @param message - User's message
	 * @param chatId - Local chat ID
	 */
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
			logger.debug("🔍 SEARCH API REQUEST:");
			logger.debug("URL:", searchUrl);
			logger.debug("Method:", "POST");
			logger.debug(
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

			logger.debug("🔍 SEARCH API RESPONSE:");
			logger.debug("Status:", searchResponse.status);
			logger.debug("Duration:", `${searchDuration}ms`);
			logger.debug(
				"Headers:",
				Object.fromEntries(searchResponse.headers.entries()),
			);

			if (searchResponse.ok) {
				const searchData = await searchResponse.json();
				logger.debug(
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
									logger.debug("🌐 SCRAPE API REQUEST:");
									logger.debug("URL:", scrapeUrl);
									logger.debug("Method:", "POST");
									logger.debug(
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

									logger.debug("🌐 SCRAPE API RESPONSE:");
									logger.debug("Status:", scrapeResponse.status);
									logger.debug("Duration:", `${scrapeDuration}ms`);
									logger.debug("URL:", result.url);

									if (scrapeResponse.ok) {
										const content = await scrapeResponse.json();
										logger.debug(
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
				systemPrompt += `Use the following search results to inform your response. IMPORTANT: When citing sources, use the domain name in brackets like [example.com] format. Place citations inline immediately after the relevant information.\n\n`;
				systemPrompt += `## Search Results (${searchResults.length} sources found):\n${searchContext}\n\n`;
				systemPrompt += `## Source References (USE THESE DOMAIN CITATIONS):\n`;
				searchResults.forEach(
					(
						result: { title: string; url: string; snippet: string },
						_idx: number,
					) => {
						const domain = new URL(result.url).hostname.replace('www.', '');
						systemPrompt += `[${domain}] ${result.title}\n    URL: ${result.url}\n    Snippet: ${result.snippet}\n\n`;
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

            systemPrompt += `\n\nProvide clear, helpful responses. When you reference information from the search results, you MUST include citations using the [domain.com] format shown above. Place citations immediately after the relevant statement. Always format output using strict GitHub-Flavored Markdown (GFM): headings, lists, tables, bold (**), italics (* or _), underline (use markdown where supported; if not, you may use <u>...</u>), and fenced code blocks with language tags. Avoid arbitrary HTML beyond <u>. This is a continued conversation, so consider the full context of previous messages.`;

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

			const aiUrl = resolveApi("/api/ai");
			logger.debug("🤖 AI API REQUEST:");
			logger.debug("URL:", aiUrl);
			logger.debug("Method:", "POST");
			logger.debug("Body:", JSON.stringify(aiRequestBody, null, 2));

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
            const aiResponse = await fetch(aiUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(aiRequestBody),
				signal: abortControllerRef.current.signal,
			});
			const aiDuration = Date.now() - aiStartTime;

			logger.debug("🤖 AI API RESPONSE:");
			logger.debug("Status:", aiResponse.status);
			logger.debug("Duration:", `${aiDuration}ms`);
			logger.debug("Headers:", Object.fromEntries(aiResponse.headers.entries()));

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
                                    const topFew = searchResults.slice(0, 3).map(r => `- ${r.title} — ${r.url}`).join("\n");
                                    accumulatedContent = `I'm sorry, I couldn't complete the streamed response. Here are top sources that may help:\n\n${topFew}`;
                                  } else {
                                    accumulatedContent = "I'm sorry, I couldn't generate a response this time.";
                                  }
                                }
								logger.debug("🔄 Streaming completed:", {
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
                                            const topFew = searchResults.slice(0, 3).map(r => `- ${r.title} — ${r.url}`).join("\n");
                                            accumulatedContent = `I'm sorry, I couldn't complete the streamed response. Here are top sources that may help:\n\n${topFew}`;
                                          } else {
                                            accumulatedContent = "I'm sorry, I couldn't generate a response this time.";
                                          }
                                        }
										logger.debug("✅ Streaming finished with [DONE]");
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
							logger.debug("Stream aborted (component unmounted or navigation)");
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
					logger.debug(
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
				logger.debug("Request aborted (component unmounted or navigation)");
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

	/**
	 * Send message handler
	 * - Checks msg limits (4 for anon)
	 * - Calls planner for topic detection
	 * - Routes to auth/anon generation
	 * - Updates chat title on first msg
	 * @param content - Message content
	 */
	const handleSendMessage = async (content: string) => {
		if (!currentChatId || isGenerating) return;

		// Check message limit for unauthenticated users
		if (!isAuthenticated && messageCount >= 4) {
			setShowSignUpModal(true);
			return;
		}

    // New-topic decision: use server planner when authenticated; otherwise fallback heuristic
    const currentMessagesForChat = typeof currentChatId === "string" 
      ? localMessages.filter((msg) => msg.chatId === currentChatId)
      : messages || [];

    // Do NOT block sending while a suggestion banner is visible.
    // If the banner is already open, bypass gating and proceed to send.
    if (!showFollowUpPrompt && isAuthenticated && typeof currentChatId !== "string") {
			// Client-side gating before planner call
			// Using module-level CHAT_COOLDOWN_MS constant
			const contentTrim = content.trim();
			const words = contentTrim.split(/\s+/).filter(Boolean);
			const estTokens = Math.ceil(contentTrim.length / 4);
			const cue = /^(now|next|also|another|different|switch|new question|unrelated)/i.test(contentTrim);
			let gapMinutes = 0;
			try {
				const prior = (messages || []).filter((m) => m.role === 'user');
				const lastUser = prior.length > 0 ? prior[prior.length - 1] : undefined;
				if (lastUser && typeof (lastUser as any).timestamp === 'number') {
					gapMinutes = Math.floor((Date.now() - (lastUser as any).timestamp) / 60000);
				}
			} catch {}
			const shouldPlanBase = estTokens >= 20 || words.length >= 10 || cue || gapMinutes >= 120;
			const chatKey = String(currentChatId);
			const lastAt = lastPlannerCallAtByChat[chatKey] || 0;
			const cooldownPassed = Date.now() - lastAt >= CHAT_COOLDOWN_MS;
			const shouldCallPlanner = shouldPlanBase && cooldownPassed;

        if (shouldCallPlanner) {
      try {
        const plan = await planSearch({
          chatId: currentChatId,
          newMessage: content,
          maxContextMessages: 10,
        });
				setLastPlannerCallAtByChat((prev) => ({ ...prev, [chatKey]: Date.now() }));
        if (plan?.suggestNewChat && (plan.decisionConfidence ?? 0) >= 0.6) {
          setPendingMessage(content);
          setPlannerHint({ reason: plan.reasons, confidence: plan.decisionConfidence });
          setShowFollowUpPrompt(true);
          return;
        }
      } catch (e) {
        // If planner fails, fall back to heuristic below
        console.warn("planSearch failed, falling back to heuristic", e);
      }
        } else {
          // If we didn't call planner, still use local heuristic for big topic shifts
          if (currentMessagesForChat.length >= 2 && isTopicChange(content, currentMessagesForChat)) {
            setPendingMessage(content);
            setPlannerHint(undefined);
            setShowFollowUpPrompt(true);
            return;
          }
        }
    } else if (!showFollowUpPrompt) {
      if (currentMessagesForChat.length >= 2 && isTopicChange(content, currentMessagesForChat)) {
        setPendingMessage(content);
        setPlannerHint(undefined);
        setShowFollowUpPrompt(true);
        return;
      }
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

	/**
	 * Share chat handler
	 * - Updates local chat sharing status
	 * - Sets public/private visibility
	 * @param isPublic - Public visibility flag
	 */
	const handleShare = (privacy: "private" | "shared" | "public") => {
		if (!currentChatId) return;

		if (typeof currentChatId === "string") {
			// Handle local chat
			setLocalChats((prev) =>
				prev.map((chat) =>
					chat._id === currentChatId
						? { ...chat, privacy }
						: chat,
				),
			);
		} else {
			// Handle Convex chat
			updateChatPrivacy({ chatId: currentChatId, privacy });
		}
		setShowShareModal(false);
	};

	/**
	 * Continue in same chat
	 * - Dismisses follow-up prompt
	 * - Sends pending message
	 * - Uses setTimeout for state sync
	 */
	const handleContinueChat = React.useCallback(() => {
		setShowFollowUpPrompt(false);
		setPlannerHint(undefined);
    // Telemetry: user chose to continue in current chat
    if (isAuthenticated && typeof currentChatId !== 'string') {
      recordClientMetric({ name: 'user_overrode_prompt', chatId: currentChatId }).catch(() => {});
    }
		// Send the pending message in the current chat
		if (pendingMessage) {
			const tempMessage = pendingMessage;
			setPendingMessage("");
			// Use setTimeout to ensure state updates properly
			setTimeout(() => {
				handleSendMessage(tempMessage);
			}, 100);
		}
	}, [pendingMessage]);

	/**
	 * Start new chat for follow-up
	 * - Creates new chat
	 * - Waits 500ms for creation
	 * - Sends pending message
	 */
	const handleNewChatForFollowUp = React.useCallback(async () => {
		setShowFollowUpPrompt(false);
		setPlannerHint(undefined);
		const tempMessage = pendingMessage;
		setPendingMessage("");
    // Telemetry: user agreed to start new chat
    if (isAuthenticated && typeof currentChatId !== 'string') {
      recordClientMetric({ name: 'new_chat_confirmed', chatId: currentChatId }).catch(() => {});
    }
		
		// Create new chat and send message
		await handleNewChat();
		// Wait for the new chat to be created before sending the message
		setTimeout(() => {
			if (tempMessage) {
				handleSendMessage(tempMessage);
			}
		}, 500);
	}, [pendingMessage, handleNewChat]);

  // Start new chat with summary: create chat, synthesize prompt with summary + question
  const handleNewChatWithSummary = React.useCallback(async () => {
    setShowFollowUpPrompt(false);
    setPlannerHint(undefined);
    const tempMessage = pendingMessage;
    setPendingMessage("");

    try {
      // Create destination chat first
      await handleNewChat();
      // Fetch a compact server-side summary from previous chat id
      const prevChatId = currentChatId;
      let summary = '';
      try {
        if (isAuthenticated && typeof prevChatId !== 'string' && prevChatId) {
          summary = await summarizeRecentAction({ chatId: prevChatId, limit: 12 });
        }
      } catch {}

      // Fallback summary from local messages when unauthenticated
      if (!summary) {
        const msgs = typeof prevChatId === 'string' ? localMessages.filter(m => m.chatId === prevChatId) : [];
        const last = msgs.slice(-12);
        summary = last.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content.slice(0,220)}`).join('\n');
      }

      // Compose first message for the new chat: include brief summary then question
      const composed = summary
        ? `Summary of previous conversation (for context):\n${summary}\n\nQuestion: ${tempMessage || ''}`
        : (tempMessage || '');

      setTimeout(() => {
        if (composed) {
          handleSendMessage(composed);
        }
      }, 450);
    } catch (e) {
      console.warn('New chat w/ summary failed', e);
      // Fallback to normal new chat flow
      await handleNewChatForFollowUp();
    }
  }, [pendingMessage, currentChatId, handleNewChatForFollowUp, handleNewChat, isAuthenticated, localMessages]);

  // Debounced draft analyzer: quick local heuristic, optional planner preflight (not blocking)
  const draftAnalyzer = useDebounce((draft: string) => {
    try {
      const val = draft.trim();
      if (!val) return;
      if (!currentChatId) return;
      // Skip if identical draft recently
      if (val.slice(0, 160) === lastDraftSeen) return;
      setLastDraftSeen(val.slice(0, 160));

      // Local heuristic only; do not call planner here (avoid extra latency)
      const msgs = typeof currentChatId === 'string' ? localMessages.filter(m => m.chatId === currentChatId) : (messages || []);
      if (msgs.length >= 2 && isTopicChange(val, msgs)) {
        // Show advisory hint non-blocking if no prompt is currently visible
        if (!showFollowUpPrompt) {
          setPendingMessage(val);
          setPlannerHint(undefined);
          setShowFollowUpPrompt(true);
        }
      }
    } catch {}
  }, 650);

  // Only forward drafts when meaningful and not generating
  const handleDraftChange = React.useCallback((draft: string) => {
    if (isGenerating) return;
    if (draft.trim().length < 12) return; // avoid popping banner on very short drafts
    draftAnalyzer(draft);
  }, [isGenerating, draftAnalyzer]);

	// Auto-create first chat if none exists and not on a chat URL
	useEffect(() => {
		const path = window.location.pathname;
		// Don't auto-create if we're on any chat URL (private, shared, or public)
		const isChatUrl = path.match(/^\/(chat|s|p)\/[a-zA-Z0-9_]+$/);

		if (!currentChatId && !isChatUrl && !propChatId && !propShareId && !propPublicId) {
			handleNewChat();
		}
	}, [currentChatId, handleNewChat, propChatId, propShareId, propPublicId]);

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


			<div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full">
				<div className="flex-1 flex flex-col min-h-0">
					<MessageList
						messages={currentMessages}
						isGenerating={isGenerating}
						searchProgress={searchProgress}
						onToggleSidebar={handleToggleSidebar}
						onShare={canShare ? () => setShowShareModal(true) : undefined}
						currentChat={currentChat}
					/>
				</div>
				<div className="flex-shrink-0 relative">
					<FollowUpPrompt
						isOpen={showFollowUpPrompt}
						onContinue={handleContinueChat}
            onNewChat={handleNewChatForFollowUp}
            onNewChatWithSummary={handleNewChatWithSummary}
						hintReason={plannerHint?.reason}
						hintConfidence={plannerHint?.confidence}
					/>
                    <MessageInput
                        onSendMessage={handleSendMessage}
                        onDraftChange={handleDraftChange}
                        disabled={isGenerating}
                        placeholder={isGenerating ? "AI is working..." : "Ask me anything..."}
                        history={userHistory}
                    />
				</div>
			</div>

			<SignUpModal
				isOpen={showSignUpModal}
				onClose={() => setShowSignUpModal(false)}
				onSwitchToSignIn={() => {
					setShowSignUpModal(false);
					setShowSignInModal(true);
				}}
			/>
			<SignInModal
				isOpen={showSignInModal}
				onClose={() => setShowSignInModal(false)}
				onSwitchToSignUp={() => {
					setShowSignInModal(false);
					setShowSignUpModal(true);
				}}
			/>

			<ShareModal
				isOpen={showShareModal}
				onClose={() => setShowShareModal(false)}
				onShare={handleShare}
				shareUrl={
					currentChat?.privacy === 'public' && currentChat.publicId ? `${window.location.origin}/p/${currentChat.publicId}`
					: currentChat?.privacy === 'shared' && currentChat.shareId ? `${window.location.origin}/s/${currentChat.shareId}`
					: `${window.location.origin}/chat/${currentChat?._id}`
				}
				privacy={currentChat?.privacy || "private"}
			/>
		</div>
	);
}
