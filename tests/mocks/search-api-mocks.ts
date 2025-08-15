/**
 * Comprehensive Search API Mock Infrastructure
 * Provides 100% synthetic behavior for all search providers
 */

import { http, HttpResponse } from "msw";
import type { SearchResult } from "../../convex/search/providers/serpapi";

// Define test scenarios for deterministic testing
export const SEARCH_TEST_SCENARIOS = {
  STANDARD: "standard",
  NO_RESULTS: "no_results",
  ERROR: "error",
  TIMEOUT: "timeout",
  RATE_LIMITED: "rate_limited",
  PARTIAL_RESULTS: "partial_results",
  CREATOR_QUERY: "creator_query",
  TECHNICAL_QUERY: "technical_query",
  CURRENT_EVENTS: "current_events",
} as const;

export type SearchScenario =
  (typeof SEARCH_TEST_SCENARIOS)[keyof typeof SEARCH_TEST_SCENARIOS];

// Mock search results database
const MOCK_SEARCH_RESULTS: Record<string, SearchResult[]> = {
  // Standard results for common queries
  "capital of France": [
    {
      title: "Paris - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Paris",
      snippet: "Paris is the capital and largest city of France...",
      relevanceScore: 0.95,
    },
    {
      title: "Paris | History, Culture & Tourism",
      url: "https://example.com/paris",
      snippet: "Discover Paris, the magnificent capital of France...",
      relevanceScore: 0.85,
    },
  ],

  // Technical documentation results
  "React hooks": [
    {
      title: "Hooks at a Glance – React",
      url: "https://react.dev/reference/react",
      snippet: "Hooks are a new addition in React 16.8...",
      relevanceScore: 0.98,
    },
    {
      title: "Using the State Hook – React",
      url: "https://react.dev/learn/state-a-components-memory",
      snippet: "State lets a component remember information...",
      relevanceScore: 0.92,
    },
  ],

  // Creator detection results
  "William Callahan": [
    {
      title: "William Callahan - Personal Website",
      url: "https://williamcallahan.com",
      snippet: "William Callahan is the creator of SearchAI.io...",
      relevanceScore: 1.0,
    },
    {
      title: "Aventure VC - William Callahan",
      url: "https://aventure.vc",
      snippet: "Partner at Aventure VC, investing in AI startups...",
      relevanceScore: 0.95,
    },
  ],

  // Current events results
  "latest AI news": [
    {
      title: "Breaking: New AI Model Released Today",
      url: "https://news.example.com/ai-today",
      snippet: "Major breakthrough in artificial intelligence announced...",
      relevanceScore: 0.88,
    },
    {
      title: "AI Industry Updates - Latest Developments",
      url: "https://tech.example.com/ai-updates",
      snippet: "Stay updated with the latest AI industry news...",
      relevanceScore: 0.82,
    },
  ],
};

// Mock planner responses
const MOCK_PLANNER_RESPONSES = {
  shouldSearch: {
    shouldSearch: true,
    contextSummary: "User is asking about a topic that requires web search",
    queries: ["enhanced query 1", "enhanced query 2"],
    suggestNewChat: false,
    decisionConfidence: 0.85,
    reasons: "Information query requiring current data",
  },

  noSearch: {
    shouldSearch: false,
    contextSummary: "User is having a conversational exchange",
    queries: [],
    suggestNewChat: false,
    decisionConfidence: 0.9,
    reasons: "Simple greeting or conversational response",
  },

  newChatSuggested: {
    shouldSearch: true,
    contextSummary: "Topic shift detected",
    queries: ["new topic query"],
    suggestNewChat: true,
    decisionConfidence: 0.75,
    reasons: "Significant topic change from previous conversation",
  },
};

// Current test scenario (can be controlled by tests)
let currentScenario: SearchScenario = SEARCH_TEST_SCENARIOS.STANDARD;
let responseDelay = 0;
let errorRate = 0;

export function setSearchTestScenario(scenario: SearchScenario) {
  currentScenario = scenario;
}

export function setResponseDelay(delay: number) {
  responseDelay = delay;
}

export function setErrorRate(rate: number) {
  errorRate = Math.max(0, Math.min(1, rate));
}

/**
 * Generate deterministic search results based on query
 */
function generateSearchResults(
  query: string,
  maxResults: number,
): SearchResult[] {
  // Check if we have predefined results for this query
  const normalizedQuery = query.toLowerCase().trim();

  // Check for exact matches first
  for (const [key, results] of Object.entries(MOCK_SEARCH_RESULTS)) {
    if (normalizedQuery.includes(key.toLowerCase())) {
      return results.slice(0, maxResults);
    }
  }

  // Generate synthetic results for unknown queries
  const syntheticResults: SearchResult[] = [];
  const baseRelevance = 0.8;

  for (let i = 0; i < Math.min(maxResults, 5); i++) {
    syntheticResults.push({
      title: `Result ${i + 1} for "${query}"`,
      url: `https://example.com/search/${encodeURIComponent(query)}/${i + 1}`,
      snippet: `This is a synthetic search result for the query "${query}". Result number ${i + 1} with relevant information...`,
      relevanceScore: baseRelevance - i * 0.1,
    });
  }

  return syntheticResults;
}

/**
 * MSW handlers for all search providers
 */
export const searchHandlers = [
  // SERP API DuckDuckGo handler
  http.get("https://serpapi.com/search", async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const num = parseInt(url.searchParams.get("num") || "5");

    // Simulate delay if configured
    if (responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelay));
    }

    // Handle different test scenarios
    switch (currentScenario) {
      case SEARCH_TEST_SCENARIOS.ERROR:
        return new HttpResponse(null, { status: 500 });

      case SEARCH_TEST_SCENARIOS.RATE_LIMITED:
        return new HttpResponse(null, { status: 429 });

      case SEARCH_TEST_SCENARIOS.TIMEOUT:
        await new Promise((resolve) => setTimeout(resolve, 30000));
        return new HttpResponse(null, { status: 408 });

      case SEARCH_TEST_SCENARIOS.NO_RESULTS:
        return HttpResponse.json({ organic_results: [] });

      case SEARCH_TEST_SCENARIOS.PARTIAL_RESULTS:
        return HttpResponse.json({
          organic_results: generateSearchResults(query, 1).map((r) => ({
            title: r.title,
            link: r.url,
            snippet: r.snippet,
          })),
        });

      default:
        const results = generateSearchResults(query, num);
        return HttpResponse.json({
          organic_results: results.map((r) => ({
            title: r.title,
            link: r.url,
            snippet: r.snippet,
          })),
        });
    }
  }),

  // OpenRouter search handler
  http.post(
    "https://openrouter.ai/api/v1/chat/completions",
    async ({ request }) => {
      const body = (await request.json()) as any;

      // Check if this is a search request or planner request
      const isSearchRequest =
        body.messages?.[0]?.content?.includes("web search");
      const isPlannerRequest =
        body.messages?.[0]?.role === "system" &&
        body.messages?.[0]?.content?.includes("search planner");

      if (responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, responseDelay));
      }

      // Simulate random errors based on error rate
      if (errorRate > 0 && Math.random() < errorRate) {
        return new HttpResponse(null, { status: 503 });
      }

      if (isPlannerRequest) {
        // Return planner response
        const userMessage = body.messages?.[1]?.content || "";
        let plannerResponse = MOCK_PLANNER_RESPONSES.shouldSearch;

        if (
          userMessage.toLowerCase().includes("hello") ||
          userMessage.toLowerCase().includes("hi")
        ) {
          plannerResponse = MOCK_PLANNER_RESPONSES.noSearch;
        } else if (userMessage.toLowerCase().includes("different topic")) {
          plannerResponse = MOCK_PLANNER_RESPONSES.newChatSuggested;
        }

        return HttpResponse.json({
          choices: [
            {
              message: {
                content: JSON.stringify(plannerResponse),
              },
            },
          ],
        });
      }

      if (isSearchRequest) {
        // Extract query from the message
        const query =
          body.messages?.[0]?.content?.match(/search for: (.*)/i)?.[1] ||
          "test query";
        const results = generateSearchResults(query, 5);

        return HttpResponse.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: results.map((r) => ({
                    title: r.title,
                    url: r.url,
                    description: r.snippet,
                  })),
                }),
              },
            },
          ],
        });
      }

      // Default response for other OpenRouter requests (AI chat completions)
      // Generate more realistic AI responses based on the user's message
      const userMessage =
        body.messages?.[body.messages.length - 1]?.content || "";
      let aiResponse = "I understand your question. Let me help you with that.";

      // Generate contextual responses based on the user's message
      if (
        userMessage.toLowerCase().includes("news") ||
        userMessage.toLowerCase().includes("latest")
      ) {
        aiResponse =
          "Based on current information, here are the latest developments: Recent advances in AI technology have shown significant progress in natural language processing and machine learning. Researchers continue to make breakthroughs in areas like computer vision and autonomous systems. The industry is seeing increased investment and adoption across various sectors.";
      } else if (
        userMessage.toLowerCase().includes("react") ||
        userMessage.toLowerCase().includes("hooks")
      ) {
        aiResponse =
          "React Hooks are functions that allow you to use state and other React features in functional components. They were introduced in React 16.8 to solve common problems with class components. Key hooks include useState for state management, useEffect for side effects, and useContext for consuming context. Hooks must be called at the top level of your component and cannot be called inside loops, conditions, or nested functions.";
      } else if (
        userMessage.toLowerCase().includes("ai") ||
        userMessage.toLowerCase().includes("artificial intelligence")
      ) {
        aiResponse =
          "Artificial Intelligence (AI) is a broad field of computer science focused on creating systems that can perform tasks typically requiring human intelligence. This includes machine learning, natural language processing, computer vision, and robotics. AI has applications in healthcare, finance, transportation, and many other industries. Current AI systems excel at pattern recognition and data analysis, though they still face challenges in areas like common sense reasoning and general intelligence.";
      } else if (userMessage.toLowerCase().includes("machine learning")) {
        aiResponse =
          "Machine Learning is a subset of AI that enables computers to learn and improve from experience without being explicitly programmed. It uses algorithms to identify patterns in data and make predictions or decisions. Common approaches include supervised learning (using labeled data), unsupervised learning (finding hidden patterns), and reinforcement learning (learning through trial and error). Popular algorithms include neural networks, decision trees, and support vector machines.";
      } else if (userMessage.toLowerCase().includes("quantum")) {
        aiResponse =
          "Quantum computing is an emerging technology that leverages quantum mechanical phenomena like superposition and entanglement to process information. Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits or qubits that can exist in multiple states simultaneously. This enables them to solve certain complex problems much faster than classical computers, particularly in areas like cryptography, optimization, and molecular modeling.";
      } else if (
        userMessage.toLowerCase().includes("william callahan") ||
        userMessage.toLowerCase().includes("searchai")
      ) {
        aiResponse =
          "William Callahan is the creator and developer of SearchAI.io, an AI-powered search application that combines web search with conversational AI. He has experience in building AI applications and is passionate about making AI technology more accessible. SearchAI.io demonstrates his expertise in integrating multiple search providers and AI services to create a comprehensive search experience.";
      } else if (
        userMessage.toLowerCase().includes("hello") ||
        userMessage.toLowerCase().includes("hi")
      ) {
        aiResponse =
          "Hello! I'm here to help you with your questions. I can search the web for current information and provide detailed answers on a wide range of topics. What would you like to know about?";
      } else {
        // Generic helpful response for other queries
        aiResponse =
          "I'd be happy to help you with that question. While I can provide general information based on my training, for the most current and specific details, I'd recommend searching the web or consulting authoritative sources. Is there a particular aspect of this topic you'd like me to explain further?";
      }

      return HttpResponse.json({
        choices: [
          {
            message: {
              content: aiResponse,
            },
          },
        ],
      });
    },
  ),

  // Direct DuckDuckGo API handler
  http.get("https://api.duckduckgo.com/*", async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";

    if (responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelay));
    }

    if (currentScenario === SEARCH_TEST_SCENARIOS.ERROR) {
      return new HttpResponse(null, { status: 500 });
    }

    const results = generateSearchResults(query, 5);

    // DuckDuckGo JSON format (instant answer API)
    const duckDuckGoResponse = {
      Abstract: results.length > 0 ? results[0].snippet : "",
      AbstractURL: results.length > 0 ? results[0].url : "",
      Heading: results.length > 0 ? results[0].title : query,
      RelatedTopics: results.slice(0, 3).map((r) => ({
        FirstURL: r.url,
        Text: `${r.title} - ${r.snippet}`,
      })),
    };

    return HttpResponse.json(duckDuckGoResponse);
  }),

  // AI service endpoint handler (/api/ai)
  http.post("/api/ai", async ({ request }) => {
    const body = (await request.json()) as any;
    const message = body.message || "";

    if (responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelay));
    }

    if (errorRate > 0 && Math.random() < errorRate) {
      return new HttpResponse(null, { status: 503 });
    }

    // Generate contextual AI response based on the user's message
    let aiResponse = "I understand your question. Let me help you with that.";

    if (
      message.toLowerCase().includes("news") ||
      message.toLowerCase().includes("latest")
    ) {
      aiResponse =
        "Based on current information, here are the latest developments: Recent advances in AI technology have shown significant progress in natural language processing and machine learning. Researchers continue to make breakthroughs in areas like computer vision and autonomous systems. The industry is seeing increased investment and adoption across various sectors.";
    } else if (
      message.toLowerCase().includes("react") ||
      message.toLowerCase().includes("hooks")
    ) {
      aiResponse =
        "React Hooks are functions that allow you to use state and other React features in functional components. They were introduced in React 16.8 to solve common problems with class components. Key hooks include useState for state management, useEffect for side effects, and useContext for consuming context. Hooks must be called at the top level of your component and cannot be called inside loops, conditions, or nested functions.";
    } else if (
      message.toLowerCase().includes("ai") ||
      message.toLowerCase().includes("artificial intelligence")
    ) {
      aiResponse =
        "Artificial Intelligence (AI) is a broad field of computer science focused on creating systems that can perform tasks typically requiring human intelligence. This includes machine learning, natural language processing, computer vision, and robotics. AI has applications in healthcare, finance, transportation, and many other industries. Current AI systems excel at pattern recognition and data analysis, though they still face challenges in areas like common sense reasoning and general intelligence.";
    } else if (message.toLowerCase().includes("machine learning")) {
      aiResponse =
        "Machine Learning is a subset of AI that enables computers to learn and improve from experience without being explicitly programmed. It uses algorithms to identify patterns in data and make predictions or decisions. Common approaches include supervised learning (using labeled data), unsupervised learning (finding hidden patterns), and reinforcement learning (learning through trial and error). Popular algorithms include neural networks, decision trees, and support vector machines.";
    } else if (message.toLowerCase().includes("quantum")) {
      aiResponse =
        "Quantum computing is an emerging technology that leverages quantum mechanical phenomena like superposition and entanglement to process information. Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits or qubits that can exist in multiple states simultaneously. This enables them to solve certain complex problems much faster than classical computers, particularly in areas like cryptography, optimization, and molecular modeling.";
    } else if (
      message.toLowerCase().includes("william callahan") ||
      message.toLowerCase().includes("searchai")
    ) {
      aiResponse =
        "William Callahan is the creator and developer of SearchAI.io, an AI-powered search application that combines web search with conversational AI. He has experience in building AI applications and is passionate about making AI technology more accessible. SearchAI.io demonstrates his expertise in integrating multiple search providers and AI services to create a comprehensive search experience.";
    } else if (
      message.toLowerCase().includes("hello") ||
      message.toLowerCase().includes("hi")
    ) {
      aiResponse =
        "Hello! I'm here to help you with your questions. I can search the web for current information and provide detailed answers on a wide range of topics. What would you like to know about?";
    } else {
      // Generic helpful response for other queries
      aiResponse =
        "I'd be happy to help you with that question. While I can provide general information based on my training, for the most current and specific details, I'd recommend searching the web or consulting authoritative sources. Is there a particular aspect of this topic you'd like me to explain further?";
    }

    // Return SSE stream format that the application expects
    const stream = new ReadableStream({
      start(controller) {
        // Send the response as a single chunk
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ content: aiResponse })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }),
];

/**
 * Test helper to verify search behavior
 */
export class SearchTestHelper {
  private callHistory: Array<{
    provider: string;
    query: string;
    timestamp: number;
    response: any;
  }> = [];

  recordCall(provider: string, query: string, response: any) {
    this.callHistory.push({
      provider,
      query,
      timestamp: Date.now(),
      response,
    });
  }

  getCallCount(provider?: string): number {
    if (!provider) return this.callHistory.length;
    return this.callHistory.filter((c) => c.provider === provider).length;
  }

  getLastCall(provider?: string) {
    const calls = provider
      ? this.callHistory.filter((c) => c.provider === provider)
      : this.callHistory;
    return calls[calls.length - 1];
  }

  reset() {
    this.callHistory = [];
  }

  // Verify fallback behavior
  verifyFallbackChain(): boolean {
    const providers = this.callHistory.map((c) => c.provider);
    const expectedOrder = ["serp", "openrouter", "duckduckgo"];

    let lastIndex = -1;
    for (const provider of providers) {
      const index = expectedOrder.indexOf(provider);
      if (index <= lastIndex) return false;
      lastIndex = index;
    }

    return true;
  }

  // Verify caching behavior
  verifyCaching(query: string): boolean {
    const calls = this.callHistory.filter((c) => c.query === query);
    // If same query called multiple times, results should be identical
    if (calls.length > 1) {
      const firstResponse = JSON.stringify(calls[0].response);
      return calls.every((c) => JSON.stringify(c.response) === firstResponse);
    }
    return true;
  }
}

export const searchTestHelper = new SearchTestHelper();
