# Scraping and Crawling Pipeline

This file defines the exact active behavior for URL discovery, scraping, and source persistence in the chat pipeline.

## Black-and-White Runtime Boundaries

- `search_web` and `scrape_webpage` are executed server-side in Convex Node actions (`"use node"` in [`convex/agents/tools_search.ts`](../../convex/agents/tools_search.ts), [`convex/agents/tools_scrape.ts`](../../convex/agents/tools_scrape.ts), [`convex/search/scraperAction.ts`](../../convex/search/scraperAction.ts)).
- The browser never executes scraping/crawling logic.
- The frontend Docker container does not crawl websites; it proxies `/api/*` to the Convex deployment URL ([`scripts/server.mjs`](../../scripts/server.mjs), [`docs/domains/deployment.md`](./deployment.md)).
- In local dev, Vite also proxies `/api` to Convex ([`vite.config.ts`](../../vite.config.ts)).

## End-to-End Call Path (One User Turn)

1. Client sends one turn to [`/api/ai/agent/stream`](../../convex/http/routes/aiAgent_stream.ts).
2. Server runs [`streamConversationalWorkflow`](../../convex/agents/workflow_conversational.ts).
3. The model run may call [`search_web`](../../convex/agents/tools_search.ts) and [`scrape_webpage`](../../convex/agents/tools_scrape.ts) in that same run.
4. Tool outputs are harvested from stream events into memory ([`convex/agents/streaming_harvest.ts`](../../convex/agents/streaming_harvest.ts)).
5. Harvested data is transformed into persisted `webResearchSources` ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).

## Dev Source Context Copy Contract

- Client explicitly requests debug source markdown with `includeDebugSourceContext: true` in the stream request when running local dev UI ([`src/lib/repositories/convex/ConvexStreamHandler.ts`](../../src/lib/repositories/convex/ConvexStreamHandler.ts)).
- HTTP route forwards that flag into workflow args ([`convex/http/routes/aiAgent_stream.ts`](../../convex/http/routes/aiAgent_stream.ts)).
- Workflow passes the same flag into harvested-source transformation ([`convex/agents/workflow_conversational.ts`](../../convex/agents/workflow_conversational.ts), [`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).
- When requested, server writes `metadata.serverContextMarkdown` per source (scraped and search-result metadata variants) in `webResearchSources`.
- For every persisted `scraped_page` source, server also stores `metadata.scrapedBodyContent` (cleaned scrape body, max 12,000 chars) and `metadata.scrapedBodyContentLength` in `webResearchSources` ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts), [`convex/search/scraper.ts#L24`](../../convex/search/scraper.ts#L24)).
- UI dev mode renders a copy icon for every source card:
  - If `metadata.serverContextMarkdown` exists, copy uses that full server-context markdown.
  - Otherwise copy uses a persisted-source snapshot markdown built from the stored `webResearchSources` record, including `scrapedBodyContent` when present ([`src/components/MessageList/MessageSources.tsx`](../../src/components/MessageList/MessageSources.tsx), [`src/lib/domain/sourceContextMarkdown.ts`](../../src/lib/domain/sourceContextMarkdown.ts)).
- Source crawl status and full-context-markdown availability are independent signals.
- Existing historical messages are not backfilled; only new assistant messages persisted after this flow include `serverContextMarkdown`.

## URL Discovery Stack (search_web)

- Provider order in active code:
  1. SerpAPI DuckDuckGo when `SERP_API_KEY` exists ([`convex/search/search_web_handler.ts#L37`](../../convex/search/search_web_handler.ts#L37)).
  2. OpenRouter search fallback ([`convex/search/search_web_handler.ts#L65`](../../convex/search/search_web_handler.ts#L65)).
  3. Direct DuckDuckGo fallback ([`convex/search/search_web_handler.ts#L90`](../../convex/search/search_web_handler.ts#L90)).
  4. Final synthetic fallback link result ([`convex/search/search_web_handler.ts#L112`](../../convex/search/search_web_handler.ts#L112)).
- Search results are cached in-process with TTL from `CACHE_TTL.SEARCH_MS` ([`convex/search/cache.ts`](../../convex/search/cache.ts), [`convex/lib/constants/cache.ts#L8`](../../convex/lib/constants/cache.ts#L8)).

## Scraping Stack (scrape_webpage)

- Active scrape implementation path:
  - [`scrape_webpage` tool](../../convex/agents/tools_scrape.ts)
  - [`api.search.scraperAction.scrapeUrl`](../../convex/search/scraperAction.ts)
  - [`scrapeWithCheerio`](../../convex/search/scraper.ts)
- Active dependencies:
  - platform `fetch` in Convex Node runtime ([`convex/search/scraper.ts#L96`](../../convex/search/scraper.ts#L96))
  - [`cheerio`](../../package.json) HTML parsing ([`convex/search/scraper.ts#L9`](../../convex/search/scraper.ts#L9))
- Playwright is not available in the Convex deployment runtime.

## Scrape Success/Failure Rules

- URL is validated before scraping ([`convex/search/scraperAction.ts#L18`](../../convex/search/scraperAction.ts#L18)).
- HTTP fetch uses a 10s timeout ([`convex/search/scraper.ts#L106`](../../convex/search/scraper.ts#L106)).
- Non-HTML responses fail (`content-type` must include `text/html`) ([`convex/search/scraper.ts#L133`](../../convex/search/scraper.ts#L133)).
- Extracted content is truncated to 12,000 chars max ([`convex/search/scraper.ts#L24`](../../convex/search/scraper.ts#L24), [`convex/search/scraper.ts#L158`](../../convex/search/scraper.ts#L158)).
- After cleanup, content shorter than 100 chars is treated as failure ([`convex/search/scraper.ts#L199`](../../convex/search/scraper.ts#L199)).
- Tool-level scrape failure is signaled via `error`/`errorMessage` or `contentLength: 0` in tool output ([`convex/agents/tools_scrape.ts#L75`](../../convex/agents/tools_scrape.ts#L75)).
- Harvester records failed URLs and error messages (`failedScrapeUrls`, `failedScrapeErrors`) ([`convex/agents/streaming_harvest.ts#L67`](../../convex/agents/streaming_harvest.ts#L67)).
- Scrape failures are non-fatal for the conversational run; they are harvested as source status metadata and do not count toward fatal workflow tool-error threshold ([`convex/agents/streaming_processor_helpers.ts`](../../convex/agents/streaming_processor_helpers.ts), [`convex/agents/streaming_processor.ts`](../../convex/agents/streaming_processor.ts)).

## What Gets Persisted (and What Does Not)

- Persisted:
  - assistant `content`
  - `webResearchSources` metadata for UI/provenance, including scrape-status flags and per-`scraped_page` body content fields (`scrapedBodyContent`, `scrapedBodyContentLength`) ([`convex/agents/workflow_conversational.ts#L246`](../../convex/agents/workflow_conversational.ts#L246), [`convex/agents/orchestration_persistence.ts`](../../convex/agents/orchestration_persistence.ts), [`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts))
- Not persisted as raw tool event logs in this path:
  - full `search_web` tool output object
  - full `scrape_webpage` tool output object
- When `includeDebugSourceContext` is requested, `webResearchSources[].metadata.serverContextMarkdown` is attached for developer inspection and UI copy workflows ([`convex/agents/helpers_context.ts`](../../convex/agents/helpers_context.ts)).

## Important Non-Guarantees

- The pipeline does not guarantee every scrape succeeds.
- A turn can still complete with partial scrape failures; failed crawl state is surfaced in source metadata ([`convex/agents/helpers_context.ts#L227`](../../convex/agents/helpers_context.ts#L227)).
- Low-relevance marking is metadata classification, not retroactive model-context removal ([`convex/agents/helpers_context.ts#L222`](../../convex/agents/helpers_context.ts#L222)).
