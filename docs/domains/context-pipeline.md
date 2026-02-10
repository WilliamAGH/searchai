# Context and Tooling Pipeline

This file defines the active chat pipeline in strict terms.
For provider-level cache behavior and optimization plan, see [`docs/domains/llm-caching.md`](./llm-caching.md).
For exact runtime details of URL discovery/scraping/crawling, see [`docs/domains/scraping-crawling.md`](./scraping-crawling.md).

## Definitions

- `chat` = one persistent thread identified by `chatId`. There is no automatic chat forking/compaction in this path ([`convex/http/routes/aiAgent_stream.ts#L48`](../../convex/http/routes/aiAgent_stream.ts#L48), [`convex/agents/orchestration_session.ts#L152`](../../convex/agents/orchestration_session.ts#L152)).
- `turn` = one request to `/api/ai/agent/stream` and one assistant run/response ([`src/lib/repositories/convex/ConvexStreamHandler.ts#L46`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L46), [`convex/agents/workflow_conversational.ts#L44`](../../convex/agents/workflow_conversational.ts#L44)).
- `message` = one persisted row in `messages` (`role`, `content`, optional metadata) ([`convex/messages.ts#L14`](../../convex/messages.ts#L14), [`convex/messages_insert_document.ts#L120`](../../convex/messages_insert_document.ts#L120)).
- `conversationContext` = derived history string built from prior message `content` in the same `chatId` ([`convex/agents/helpers_builders.ts#L228`](../../convex/agents/helpers_builders.ts#L228)).
- `tool output` = per-run output from `plan_research`, `search_web`, `scrape_webpage` while the run is executing ([`convex/agents/tools.ts#L64`](../../convex/agents/tools.ts#L64), [`convex/agents/streaming_processor.ts#L228`](../../convex/agents/streaming_processor.ts#L228)).
- `webResearchSources` = structured source metadata attached to the persisted assistant message after run completion ([`convex/agents/workflow_conversational.ts#L246`](../../convex/agents/workflow_conversational.ts#L246), [`convex/agents/orchestration_persistence.ts#L132`](../../convex/agents/orchestration_persistence.ts#L132)).

## Hard Limits (Current Code)

- `MAX_CHARACTERS_PER_MESSAGE_SENT_TO_BACKEND = 10000` on `payload.message` ([`convex/http/routes/aiAgent_stream.ts#L39`](../../convex/http/routes/aiAgent_stream.ts#L39), [`convex/http/routes/aiAgent_utils.ts#L89`](../../convex/http/routes/aiAgent_utils.ts#L89)).
- `MAX_CONTEXT_MESSAGES_PER_TURN = 20` prior messages considered for history context ([`convex/lib/constants/cache.ts#L91`](../../convex/lib/constants/cache.ts#L91), [`convex/agents/helpers_builders.ts#L235`](../../convex/agents/helpers_builders.ts#L235)).
- `MAX_CONTEXT_CHARACTERS_USED_BY_LLM_PER_TURN = 4000` on the joined history string only ([`convex/lib/constants/cache.ts#L93`](../../convex/lib/constants/cache.ts#L93), [`convex/agents/helpers_builders.ts#L241`](../../convex/agents/helpers_builders.ts#L241)).
- `MAX_CONVERSATION_CONTEXT_CHARS_ACCEPTED_AT_HTTP_BOUNDARY = 5000` for inbound `payload.conversationContext` sanitize only ([`convex/http/routes/aiAgent_stream.ts#L76`](../../convex/http/routes/aiAgent_stream.ts#L76)).
- `MAX_AGENT_TURNS_PER_RUN = 12` for one model/tool run in one turn ([`convex/lib/constants/cache.ts#L34`](../../convex/lib/constants/cache.ts#L34), [`convex/agents/workflow_conversational.ts#L92`](../../convex/agents/workflow_conversational.ts#L92)).

`MAX_AGENT_TURNS_PER_RUN` means internal model round-trips inside one user request, not chat messages:

- One user turn (one `/api/ai/agent/stream` request) can contain multiple agent turns.
- Example budget in comments: `plan_research (1)` + `search_web up to 3` + `scrape_webpage up to 4` + `final response (1)` = `9` worst-case sequential turns, with headroom set to `12` ([`convex/lib/constants/cache.ts#L22`](../../convex/lib/constants/cache.ts#L22), [`convex/lib/constants/cache.ts#L30`](../../convex/lib/constants/cache.ts#L30)).

- `MAX_SCRAPED_PAGE_CONTENT_CHARS_PER_SCRAPE = 12000` per scraped page body ([`convex/search/scraper.ts#L24`](../../convex/search/scraper.ts#L24), [`convex/search/scraper.ts#L158`](../../convex/search/scraper.ts#L158)).
- `MAX_WEB_RESEARCH_SOURCES_PER_HTTP_REQUEST = 12` on inbound `payload.webResearchSources` ([`convex/http/routes/aiAgent_utils.ts#L13`](../../convex/http/routes/aiAgent_utils.ts#L13), [`convex/http/routes/aiAgent_utils.ts#L99`](../../convex/http/routes/aiAgent_utils.ts#L99)).
- `MAX_WEB_RESEARCH_SOURCE_URL_CHARS_PER_HTTP_REQUEST = 2000` and `MAX_WEB_RESEARCH_SOURCE_TITLE_CHARS_PER_HTTP_REQUEST = 500` on inbound source sanitize ([`convex/http/routes/aiAgent_utils.ts#L11`](../../convex/http/routes/aiAgent_utils.ts#L11), [`convex/http/routes/aiAgent_utils.ts#L12`](../../convex/http/routes/aiAgent_utils.ts#L12)).

Undefined in current repo constants for this path:

- `MAX_CHARACTERS_PER_MESSAGE_RECEIVED_FROM_BACKEND = undefined` (assistant output is persisted without a local max-char clamp in this pipeline) ([`convex/agents/workflow_conversational.ts#L214`](../../convex/agents/workflow_conversational.ts#L214), [`convex/messages.ts#L140`](../../convex/messages.ts#L140)).
- `MAX_CHARACTERS_PER_CHAT_CONVERSATION_ID = undefined` (format validation exists; no explicit max-char constant) ([`convex/lib/validators.ts#L123`](../../convex/lib/validators.ts#L123), [`convex/lib/validators.ts#L175`](../../convex/lib/validators.ts#L175)).
- `MAX_CHARACTERS_PER_TOOL_CALL = undefined` as a global tool-schema char cap (`z.string()` without `.max(...)`) ([`convex/agents/tools_plan.ts#L42`](../../convex/agents/tools_plan.ts#L42), [`convex/agents/tools_search.ts#L72`](../../convex/agents/tools_search.ts#L72), [`convex/agents/tools_scrape.ts#L39`](../../convex/agents/tools_scrape.ts#L39)).

Typical English estimate: `4000` chars is about `650-800` words.

## Exact Turn Flow

1. Client sends `chatId`, `message`, and client-built `conversationContext` to `/api/ai/agent/stream` ([`src/lib/repositories/convex/ConvexStreamHandler.ts#L56`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L56)).
2. Route sanitizes `message` (10000) and inbound `conversationContext` (5000) ([`convex/http/routes/aiAgent_stream.ts#L39`](../../convex/http/routes/aiAgent_stream.ts#L39), [`convex/http/routes/aiAgent_stream.ts#L76`](../../convex/http/routes/aiAgent_stream.ts#L76)).
3. Server loads the chat, fetches recent messages (`limit: 20`), then persists the new user message ([`convex/agents/orchestration_session.ts#L180`](../../convex/agents/orchestration_session.ts#L180), [`convex/agents/orchestration_session.ts#L214`](../../convex/agents/orchestration_session.ts#L214)).
4. Server builds canonical `conversationContext` from previously fetched messages. Current user message is passed separately as `userQuery` ([`convex/agents/orchestration_session.ts#L235`](../../convex/agents/orchestration_session.ts#L235), [`convex/agents/workflow_conversational.ts#L79`](../../convex/agents/workflow_conversational.ts#L79)).
5. Agent runs (`run(..., stream: true)`) and may call `plan_research`, `search_web`, `scrape_webpage` in this same run ([`convex/agents/workflow_conversational.ts#L89`](../../convex/agents/workflow_conversational.ts#L89), [`convex/agents/tools.ts#L64`](../../convex/agents/tools.ts#L64)).
6. Tool outputs are harvested from run stream events during this run ([`convex/agents/streaming_processor.ts#L228`](../../convex/agents/streaming_processor.ts#L228)).
7. After run completion, harvested data is transformed into `webResearchSources`; for low relevance (`< 0.5`) search results, code sets `metadata.markedLowRelevance = true` on source metadata ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts), [`convex/lib/constants/cache.ts#L50`](../../convex/lib/constants/cache.ts#L50)).
8. This low-relevance flag is metadata only; it does not remove already-seen tool output from the current run and is not used by history-context construction ([`convex/agents/streaming_processor.ts#L228`](../../convex/agents/streaming_processor.ts#L228), [`convex/agents/helpers_builders.ts#L228`](../../convex/agents/helpers_builders.ts#L228)).
9. Assistant message is persisted in the same `chatId` with `content` and `webResearchSources` ([`convex/agents/orchestration_persistence.ts#L127`](../../convex/agents/orchestration_persistence.ts#L127), [`convex/agents/orchestration_persistence.ts#L132`](../../convex/agents/orchestration_persistence.ts#L132)).
10. Next turn repeats. Next-turn history context is rebuilt from persisted message `content` only.

## What Enters Next-Turn Context

Included in next-turn `conversationContext` (and subject to `20` + `4000` caps):

- Prior message `content` text from the same `chatId`, role-prefixed (`User:`, `Assistant:`, `System:`) ([`convex/agents/helpers_builders.ts#L235`](../../convex/agents/helpers_builders.ts#L235), [`convex/agents/helpers_builders.ts#L241`](../../convex/agents/helpers_builders.ts#L241)).

Not included in next-turn `conversationContext`:

- Current turn `userQuery`.
- Raw `search_web` output.
- Raw `scrape_webpage` content/output JSON.
- `webResearchSources` metadata.
- `metadata.serverContextMarkdown` (dev inspection payload) is not read by history-context construction.
- `markedLowRelevance` does not remove text from `conversationContext`; it is a metadata flag used after harvesting/persistence for source status ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts), [`convex/agents/orchestration_persistence.ts#L132`](../../convex/agents/orchestration_persistence.ts#L132), [`convex/agents/helpers_builders.ts#L238`](../../convex/agents/helpers_builders.ts#L238)).

Carry-forward rule:

- Tool-derived facts carry into future turns only if they were written into persisted message `content`.

## First Message In A New Chat

For a brand new `chatId`:

1. Prior history context is empty.
2. Model receives current `userQuery`.
3. Model may call search/scrape tools.
4. Tool outputs inform the same-turn answer.
5. Assistant `content` and `webResearchSources` are persisted to that same `chatId`.
6. On the second turn, context is rebuilt from that persisted message text.

## 21st Prior Message Behavior

- The oldest prior message is excluded from history-context construction (`slice(-20)`).
- The message is not deleted from DB; it is only outside the context window.

Code: [`convex/agents/helpers_builders.ts#L235`](../../convex/agents/helpers_builders.ts#L235), [`src/lib/repositories/convex/ConvexStreamHandler.ts#L51`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L51).

## Client vs Server Responsibilities

- Client: send turn request; receive stream; render UI ([`src/hooks/chatActions/sendMessage.ts#L17`](../../src/hooks/chatActions/sendMessage.ts#L17)).
- Server: validate/sanitize request, fetch/save messages, build canonical context, run agent/tools, persist assistant output/metadata ([`convex/http/routes/aiAgent_stream.ts#L21`](../../convex/http/routes/aiAgent_stream.ts#L21), [`convex/agents/workflow_conversational.ts#L44`](../../convex/agents/workflow_conversational.ts#L44)).
- Tool execution is server-side Convex Node runtime, not client-side ([`convex/agents/tools_plan.ts#L1`](../../convex/agents/tools_plan.ts#L1), [`convex/agents/tools_search.ts#L1`](../../convex/agents/tools_search.ts#L1), [`convex/agents/tools_scrape.ts#L1`](../../convex/agents/tools_scrape.ts#L1)).

## URL Discovery And Crawling Stack

- URL discovery is `search_web` -> `api.search.searchWeb` with provider cascade SerpAPI -> OpenRouter -> DuckDuckGo -> fallback ([`convex/agents/tools_search.ts#L106`](../../convex/agents/tools_search.ts#L106), [`convex/search/search_web_handler.ts`](../../convex/search/search_web_handler.ts)).
- Crawling/parsing is `scrape_webpage` -> `api.search.scraperAction.scrapeUrl` -> `scrapeUrlUnified` -> `scrapeWithCheerio` ([`convex/agents/tools_scrape.ts#L67`](../../convex/agents/tools_scrape.ts#L67), [`convex/search/scraperAction.ts`](../../convex/search/scraperAction.ts), [`convex/search/scraperUnified.ts`](../../convex/search/scraperUnified.ts), [`convex/search/scraper.ts`](../../convex/search/scraper.ts)).
- Runtime boundary, dependency list, success/failure rules, and proxy/deployment details are defined in [`docs/domains/scraping-crawling.md`](./scraping-crawling.md).

## Active Path vs Dormant Code

Active chat path:

- [`src/hooks/chatActions/sendMessage.ts`](../../src/hooks/chatActions/sendMessage.ts#L17) -> [`src/lib/repositories/convex/ConvexStreamHandler.ts`](../../src/lib/repositories/convex/ConvexStreamHandler.ts#L34) -> [`convex/http/routes/aiAgent_stream.ts`](../../convex/http/routes/aiAgent_stream.ts#L97) -> [`convex/agents/workflow_conversational.ts`](../../convex/agents/workflow_conversational.ts#L44).

Not the active chat-stream route:

- Legacy research workflow entrypoint [`convex/agents/workflow_research.ts`](../../convex/agents/workflow_research.ts#L33).
- Planner action [`convex/search.ts`](../../convex/search.ts#L49) has no active call site in this chat-stream path.
- Standalone [`convex/http/routes/search.ts`](../../convex/http/routes/search.ts#L31) and [`convex/http/routes/scrape.ts`](../../convex/http/routes/scrape.ts#L35) exist, but in-app chat uses `/api/ai/agent/stream`.
