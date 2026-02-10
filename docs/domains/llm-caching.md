# LLM Caching by Provider

This file defines provider-side LLM caching behavior for the active chat pipeline and what is currently implemented.

## Current Routing and Request Shape

- The app uses `@openai/agents` `run(...)` from Convex actions ([`convex/agents/workflow_conversational.ts#L89`](../../convex/agents/workflow_conversational.ts#L89)).
- Provider mode is selected in one place:
  - OpenRouter or `/chat/completions` endpoint -> Chat Completions API (`setOpenAIAPI("chat_completions")`) ([`convex/lib/providers/openai.ts#L84`](../../convex/lib/providers/openai.ts#L84), [`convex/lib/providers/openai.ts#L99`](../../convex/lib/providers/openai.ts#L99)).
  - OpenAI endpoint -> Responses API (`setOpenAIAPI("responses")`) ([`convex/lib/providers/openai.ts#L105`](../../convex/lib/providers/openai.ts#L105)).
- Per turn, we send one rebuilt input string (`Previous conversation: ... User: ...`) instead of provider conversation handles ([`convex/agents/workflow_conversational.ts#L78`](../../convex/agents/workflow_conversational.ts#L78)).
- `run(...)` is called without `previousResponseId` or `conversationId` even though the SDK supports both ([`node_modules/@openai/agents-core/dist/run.d.ts`](../../node_modules/@openai/agents-core/dist/run.d.ts)).

## Provider Matrix

### OpenAI

- OpenAI supports automatic [prompt caching](https://platform.openai.com/docs/guides/prompt-caching).
- OpenAI Responses supports server-managed state via [`previous_response_id` and `conversation`](https://platform.openai.com/docs/guides/conversation-state?api-mode=responses), and request-level cache steering such as [`prompt_cache_key`](https://platform.openai.com/docs/api-reference/responses/create).
- Current status in this repo:
  - We use Responses only on OpenAI endpoints ([`convex/lib/providers/openai.ts#L105`](../../convex/lib/providers/openai.ts#L105)).
  - We do not pass `previousResponseId` or `conversationId` into `run(...)` ([`convex/agents/workflow_conversational.ts#L89`](../../convex/agents/workflow_conversational.ts#L89)).
  - We do not set `prompt_cache_key` in model settings/provider data.

### Anthropic

- Anthropic prompt caching is explicit and uses `cache_control` breakpoints ([prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching), [API prompt caching reference](https://docs.claude.com/en/api/prompt-caching)).
- Current status in this repo:
  - No active request path sets Anthropic `cache_control`.
  - `cache_control` exists only in a legacy OpenRouter type and is not wired into live request construction ([`convex/lib/providers/openrouter_types.ts#L8`](../../convex/lib/providers/openrouter_types.ts#L8)).

### OpenRouter

- OpenRouter supports prompt caching with provider-specific behavior ([OpenRouter prompt caching docs](https://openrouter.ai/docs/features/prompt-caching)):
  - OpenAI/Grok models: automatic caching.
  - Anthropic models: explicit `cache_control` still required.
- Current status in this repo:
  - OpenRouter traffic goes through Chat Completions mode ([`convex/lib/providers/openai.ts#L84`](../../convex/lib/providers/openai.ts#L84), [`convex/lib/providers/openai.ts#L99`](../../convex/lib/providers/openai.ts#L99)).
  - Provider routing settings are sent (`provider.order`, `allow_fallbacks`) but prompt-cache directives are not ([`convex/lib/providers/openai.ts#L177`](../../convex/lib/providers/openai.ts#L177), [`convex/lib/providers/openai_config.ts#L37`](../../convex/lib/providers/openai_config.ts#L37)).

### xAI / Grok

- xAI describes automatic prefix caching and recommends using `x-grok-conv-id` for stable conversation cache affinity ([prompt caching guide](https://docs.x.ai/docs/guides/prompt-caching), [billing/usage details](https://docs.x.ai/docs/guides/consumption-and-rate-limits), [Responses API guide](https://docs.x.ai/docs/guides/responses-api)).
- Current status in this repo:
  - We do not set `x-grok-conv-id` headers in the provider client path.
  - We do not use `previousResponseId` or `conversationId` in `run(...)`, so we are not using stateful continuation hooks exposed by the SDK.

### Convex (Platform Layer)

- Convex actions execute server-side and call third-party APIs; Convex is not the provider-side prompt cache itself ([Convex actions](https://docs.convex.dev/functions/actions)).
- Current status in this repo:
  - We have app-level caches for search/scrape/planning lifetimes ([`convex/lib/constants/cache.ts`](../../convex/lib/constants/cache.ts), [`convex/search/cache.ts`](../../convex/search/cache.ts)).
  - Those are distinct from OpenAI/Anthropic/OpenRouter/xAI prompt-token caching.

## Bottom Line for Current Pipeline

- We likely get some automatic prefix caching benefits from providers.
- We are not using the strongest provider-side continuity controls (`previousResponseId`, `conversationId`, Anthropic `cache_control`, xAI `x-grok-conv-id`).
- Rebuilding a flat `Previous conversation: ...` string each turn reduces cache-key stability compared with provider-managed conversation continuation.

## Recommended Next Steps

1. Persist provider response handles per `chatId` and pass them into `run(...)`:
   - `previousResponseId` for stateless chaining.
   - `conversationId` where provider supports long-lived server-side conversations.
2. Add provider-specific cache hints:
   - OpenAI Responses: `prompt_cache_key` for stable prefixes.
   - Anthropic (direct or via OpenRouter Anthropic): explicit `cache_control` breakpoints.
   - xAI: `x-grok-conv-id` per chat.
3. Keep prompt prefixes stable:
   - Separate static policy/instruction blocks from volatile scrape/tool payloads.
   - Avoid unnecessary timestamp and formatting churn in repeated system/prefix sections.
4. Add telemetry:
   - Record response usage details (`cached_tokens` where available) and track cache-hit rates by provider/model.
5. Validate with A/B runs:
   - Baseline: current flow.
   - Variant: conversation handles + cache hints.
   - Compare latency and token cost by provider/model.
