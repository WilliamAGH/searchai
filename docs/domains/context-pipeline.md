# Context and Tooling Pipeline

This document clarifies where conversation context comes from, how tools execute, how crawl/relevance status is decided, and which paths are live versus dormant.

## What Actually Happens

### 1) Context Size and Truncation

The frontend sends one request containing the new user message and a `conversationContext` string built from up to 20 prior messages ([`src/lib/repositories/convex/ConvexStreamHandler.ts#L49`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L49), [`src/lib/repositories/convex/ConvexStreamHandler.ts#L51`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L51)).

The `4000` character limit is one cap on the combined context string, not `4000` per message ([`src/lib/repositories/convex/ConvexStreamHandler.ts#L67`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L67), [`convex/agents/helpers_builders.ts#L241`](../../convex/agents/helpers_builders.ts#L241), [`convex/lib/constants/cache.ts#L93`](../../convex/lib/constants/cache.ts#L93)).

In typical English prose, `4000` characters is usually around `650-800` words.

Backend context is rebuilt from stored chat messages as the canonical source, and only falls back to request context if the rebuilt context is empty ([`convex/agents/orchestration_session.ts#L235`](../../convex/agents/orchestration_session.ts#L235), [`convex/agents/orchestration_session.ts#L236`](../../convex/agents/orchestration_session.ts#L236)).

The `4000` cap applies only to the single joined conversation-history string (`conversationContext`) built from role-prefixed message text ([`src/lib/repositories/convex/ConvexStreamHandler.ts#L62`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L62), [`src/lib/repositories/convex/ConvexStreamHandler.ts#L67`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L67), [`convex/agents/helpers_builders.ts#L238`](../../convex/agents/helpers_builders.ts#L238), [`convex/agents/helpers_builders.ts#L241`](../../convex/agents/helpers_builders.ts#L241)).

Neither frontend nor backend appends raw tool output into that string. Both builders use message `content` only, not tool payload fields ([`src/lib/repositories/convex/ConvexStreamHandler.ts#L52`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L52), [`convex/agents/helpers_builders.ts#L231`](../../convex/agents/helpers_builders.ts#L231), [`convex/agents/helpers_builders.ts#L238`](../../convex/agents/helpers_builders.ts#L238)).

Scraped/crawled page bodies are outside that cap and flow through tool output payloads (`content`, `summary`, errors) from `scrape_webpage` ([`convex/agents/tools_scrape.ts#L118`](../../convex/agents/tools_scrape.ts#L118), [`convex/agents/tools_scrape.ts#L157`](../../convex/agents/tools_scrape.ts#L157)). Search result payloads and enrichment are also outside that cap and come from `search_web` outputs ([`convex/agents/tools_search.ts#L120`](../../convex/agents/tools_search.ts#L120)).

Source status metadata (`crawlAttempted`, `crawlSucceeded`, `excludedByRelevance`) is outside that cap as well, because it is computed after tool-output harvesting when `webResearchSources` are built ([`convex/agents/streaming_processor.ts#L228`](../../convex/agents/streaming_processor.ts#L228), [`convex/agents/helpers_context.ts#L94`](../../convex/agents/helpers_context.ts#L94), [`convex/agents/helpers_context.ts#L146`](../../convex/agents/helpers_context.ts#L146), [`convex/agents/helpers_context.ts#L153`](../../convex/agents/helpers_context.ts#L153)).

Tool outputs are not persisted into conversation history as raw search/scrape payloads. The persisted history field is message `content`, and later `conversationContext` is rebuilt from that message text only, so crawl-derived facts appear later only if they were written into the assistant's saved answer text ([`convex/messages.ts#L140`](../../convex/messages.ts#L140), [`convex/agents/helpers_builders.ts#L234`](../../convex/agents/helpers_builders.ts#L234), [`convex/agents/helpers_builders.ts#L238`](../../convex/agents/helpers_builders.ts#L238)).

### 2) One User Request vs Internal Tool Calls

Each user turn starts as one `/api/ai/agent/stream` request that runs one conversational workflow ([`convex/http/routes/aiAgent_stream.ts#L97`](../../convex/http/routes/aiAgent_stream.ts#L97), [`convex/agents/workflow_conversational.ts#L44`](../../convex/agents/workflow_conversational.ts#L44)).

Inside that single run, the agent can make multiple independent tool calls (`plan_research`, `search_web`, `scrape_webpage`) before final output ([`convex/agents/tools.ts#L64`](../../convex/agents/tools.ts#L64), [`convex/agents/workflow_conversational.ts#L89`](../../convex/agents/workflow_conversational.ts#L89)).

Each new user turn is a new HTTP request but stays on the same chat thread by reusing `chatId`; user and assistant messages are persisted to that same chat, and then context is rebuilt from that chat's recent messages ([`src/hooks/chatActions/sendMessage.ts#L71`](../../src/hooks/chatActions/sendMessage.ts#L71), [`convex/agents/orchestration_session.ts#L215`](../../convex/agents/orchestration_session.ts#L215), [`convex/agents/orchestration_persistence.ts#L128`](../../convex/agents/orchestration_persistence.ts#L128)).

The `4000` cap is applied once per turn to the rebuilt aggregate context string, not once per historical message and not once per prior assistant response ([`convex/agents/helpers_builders.ts#L241`](../../convex/agents/helpers_builders.ts#L241), [`convex/lib/constants/cache.ts#L93`](../../convex/lib/constants/cache.ts#L93)).

The legacy research workflow exists but is not the route currently used for this endpoint ([`convex/agents/workflow_research.ts#L33`](../../convex/agents/workflow_research.ts#L33)).

### 3) Which Path Finds URLs vs Crawls Content

`search_web` finds candidate URLs by calling `api.search.searchWeb` ([`convex/agents/tools_search.ts#L106`](../../convex/agents/tools_search.ts#L106), [`convex/search.ts#L27`](../../convex/search.ts#L27)).

`searchWeb` provider order is SerpAPI -> OpenRouter -> DuckDuckGo -> fallback ([`convex/search/search_web_handler.ts#L37`](../../convex/search/search_web_handler.ts#L37), [`convex/search/search_web_handler.ts#L65`](../../convex/search/search_web_handler.ts#L65), [`convex/search/search_web_handler.ts#L90`](../../convex/search/search_web_handler.ts#L90), [`convex/search/search_web_handler.ts#L112`](../../convex/search/search_web_handler.ts#L112)).

`scrape_webpage` crawls/parses page content through `api.search.scraperAction.scrapeUrl`, then `scrapeUrlUnified`, then `scrapeWithCheerio` ([`convex/agents/tools_scrape.ts#L67`](../../convex/agents/tools_scrape.ts#L67), [`convex/search/scraperAction.ts#L22`](../../convex/search/scraperAction.ts#L22), [`convex/search/scraperUnified.ts#L12`](../../convex/search/scraperUnified.ts#L12), [`convex/search/scraper.ts#L52`](../../convex/search/scraper.ts#L52)).

Scraped page body size is constrained by scraper limits (`MAX_CONTENT_LENGTH = 12000`), not by conversation-context truncation ([`convex/search/scraper.ts#L24`](../../convex/search/scraper.ts#L24), [`convex/search/scraper.ts#L158`](../../convex/search/scraper.ts#L158)).

### 4) How Sources Are Included, Failed, or Excluded

Tool outputs are processed event-by-event. Successful and failed tool outputs are both harvested ([`convex/agents/streaming_processor.ts#L228`](../../convex/agents/streaming_processor.ts#L228), [`convex/agents/streaming_processor.ts#L234`](../../convex/agents/streaming_processor.ts#L234), [`convex/agents/streaming_processor_helpers.ts#L26`](../../convex/agents/streaming_processor_helpers.ts#L26)).

Scrape failures are tracked by normalized URL and optional error message ([`convex/agents/streaming_harvest.ts#L67`](../../convex/agents/streaming_harvest.ts#L67)).

Final source metadata is assigned during `webResearchSources` construction:

- Crawl success: `crawlAttempted=true`, `crawlSucceeded=true` ([`convex/agents/helpers_context.ts#L94`](../../convex/agents/helpers_context.ts#L94))
- Crawl attempted but failed: `crawlAttempted=true`, `crawlSucceeded=false` ([`convex/agents/helpers_context.ts#L146`](../../convex/agents/helpers_context.ts#L146))
- Excluded by relevance: `excludedByRelevance=true` when relevance is below `0.5` and not already marked as a failed crawl ([`convex/agents/helpers_context.ts#L137`](../../convex/agents/helpers_context.ts#L137), [`convex/lib/constants/cache.ts#L50`](../../convex/lib/constants/cache.ts#L50))

That metadata is then sent in stream metadata/persisted events and attached to the assistant message consumed by the UI ([`convex/agents/workflow_events.ts#L161`](../../convex/agents/workflow_events.ts#L161), [`convex/agents/orchestration_persistence.ts#L124`](../../convex/agents/orchestration_persistence.ts#L124), [`src/hooks/utils/streamHandler.ts#L168`](../../src/hooks/utils/streamHandler.ts#L168)).

This metadata attachment step happens after tool-output harvesting and is separate from conversation-context construction.

The low-relevance cutoff (`< 0.5`) is applied during this post-harvest source-construction step, not as a pre-tool or pre-model filter; there is no separate extra conversation API call that first filters tool context before the model sees tool outputs in the active run ([`convex/agents/streaming_processor.ts#L228`](../../convex/agents/streaming_processor.ts#L228), [`convex/agents/workflow_conversational.ts#L246`](../../convex/agents/workflow_conversational.ts#L246), [`convex/agents/helpers_context.ts#L137`](../../convex/agents/helpers_context.ts#L137)).

### 5) UI Dot Meaning

The source list maps status like this: green dot = crawl success, amber dot = crawl attempted and failed, slate dot = excluded by relevance, and no dot = no crawl-status signal for that row ([`src/components/MessageList/MessageSources.tsx#L173`](../../src/components/MessageList/MessageSources.tsx#L173), [`src/components/MessageList/MessageSources.tsx#L178`](../../src/components/MessageList/MessageSources.tsx#L178), [`src/components/MessageList/MessageSources.tsx#L183`](../../src/components/MessageList/MessageSources.tsx#L183)).

### 6) Live Pipeline vs Dormant Code

The live in-app chat path starts at [`sendMessageWithStreaming`](../../src/hooks/chatActions/sendMessage.ts#L17), calls [`repository.generateResponse`](../../src/hooks/chatActions/sendMessage.ts#L71), resolves to [`ConvexChatRepository`](../../src/hooks/useChatRepository.ts#L20), and then reaches [`ConvexStreamHandler.generateResponse`](../../src/lib/repositories/ConvexChatRepository.ts#L154) which targets [`/api/ai/agent/stream`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L46).

The active backend route registration for chat streaming is [`registerAgentAIRoutes`](../../convex/http/routes/aiAgent.ts#L19), and that route delegates to [`handleAgentStream`](../../convex/http/routes/aiAgent.ts#L31), which invokes [`streamConversationalWorkflow`](../../convex/http/routes/aiAgent_stream.ts#L97).

The older three-stage orchestration path exists in [`streamResearchWorkflow`](../../convex/agents/workflow_research.ts#L33) and its helpers ([`workflow_instant.ts`](../../convex/agents/workflow_instant.ts), [`workflow_fast_path.ts`](../../convex/agents/workflow_fast_path.ts), [`workflow_parallel_path.ts`](../../convex/agents/workflow_parallel_path.ts), [`parallel_research.ts`](../../convex/agents/parallel_research.ts)), but this chain is currently not wired to the chat stream route.

Standalone HTTP endpoints [`/api/search`](../../convex/http/routes/search.ts#L31) and [`/api/scrape`](../../convex/http/routes/scrape.ts#L35) are registered and functional, but the in-app chat streaming path uses [`/api/ai/agent/stream`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L46) rather than those endpoints.

The planner action [`search.planSearch`](../../convex/search.ts#L49) and legacy planner module [`convex/search/planner.ts`](../../convex/search/planner.ts) exist in code, but there are no in-repo runtime call sites for that planner action in the active chat pipeline.

There are two scrape action exports: one in [`search/scraperAction.ts`](../../convex/search/scraperAction.ts#L13) and one in [`search/scraper.ts`](../../convex/search/scraper.ts#L291). Current tool and HTTP call sites target [`scraperAction.scrapeUrl`](../../convex/agents/tools_scrape.ts#L68), while the direct action export in `search/scraper.ts` is not used by the current pipeline.

### 7) Proposed Focus

If the product direction is a single conversational pipeline, treat [`streamConversationalWorkflow`](../../convex/agents/workflow_conversational.ts#L44) as canonical and formally deprecate the unused research-chain entrypoint to reduce cognitive load and maintenance risk.

Consolidate scrape entrypoints around one action surface (preferably [`search/scraperAction.ts`](../../convex/search/scraperAction.ts#L13) -> [`search/scraperUnified.ts`](../../convex/search/scraperUnified.ts#L12) -> [`search/scraper.ts`](../../convex/search/scraper.ts#L52)) so docs, tests, and observability align to one path.

Decide whether [`/api/search`](../../convex/http/routes/search.ts#L31) and [`/api/scrape`](../../convex/http/routes/scrape.ts#L35) are first-class public APIs or only historical/internal surfaces; either document them as supported public contracts or deprecate them.

Keep one explicit context source of truth by documenting that backend-rebuilt context from [`initializeWorkflowSession`](../../convex/agents/orchestration_session.ts#L88) is canonical, with request-level [`conversationContext`](../../convex/http/routes/aiAgent_stream.ts#L76) treated only as fallback input.
