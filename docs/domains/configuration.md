# Configuration

This project uses:

- Vite build-time env vars (prefixed with `VITE_`) for the frontend
- Convex runtime env vars for backend behavior (`npx convex env set ...`)
- Optional runtime env vars for self-hosted Docker (`server.mjs`)

## Frontend (Vite)

Set these in `.env.local` (or `.env.{mode}`) before running/building.

- `VITE_CONVEX_URL` (required): your Convex deployment URL (typically `https://<deployment>.convex.cloud`)
- `VITE_AGENT_SIGNING_KEY` (optional): used to verify signed `persisted` SSE events (should match `AGENT_SIGNING_KEY` in Convex)

## Convex CLI (local)

- `CONVEX_DEPLOYMENT` (optional): the Convex deployment name used by `npx convex dev` / `npx convex deploy`

## Convex runtime (backend)

Set these in the Convex deployment environment:

```bash
# Example
npx convex env set KEY "value"
```

### CORS origins (required)

`CONVEX_ALLOWED_ORIGINS` is required for browser clients. The HTTP routes validate the request `Origin` and will return `403` if the origin is not allowlisted.

Examples:

```bash
npx convex env set CONVEX_ALLOWED_ORIGINS "http://localhost:5173,http://127.0.0.1:5173"
```

Note: If you include any localhost/127.0.0.1 dev origin, the backend also allows the common Vite dev/preview ports (5173/5174/4173) to reduce friction during local development.

```bash
npx convex env set CONVEX_ALLOWED_ORIGINS "https://dev.search-ai.io,https://search-ai.io" --prod
```

### AI provider

At least one API key must be set:

- `LLM_API_KEY` (highest precedence)
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`

Optional configuration:

- `LLM_BASE_URL` / `OPENAI_BASE_URL` / `OPENROUTER_BASE_URL`
- `LLM_MODEL` / `OPENAI_MODEL`
- `LLM_VISION_MODEL` / `OPENAI_VISION_MODEL` (used when image attachments are present; default: `gpt-4o-mini`)
- `LLM_TEMPERATURE`
- `LLM_MAX_OUTPUT_TOKENS`
- `LLM_REASONING` (`minimal`/`low`/`medium`/`high`)
- `LLM_PROVIDER_SORT`, `LLM_PROVIDER_ORDER`, `LLM_PROVIDER_ALLOW_FALLBACKS` (OpenRouter routing)
- `LLM_DEBUG_FETCH` (`1` enables request/response logging)
- `LLM_HEALTHCHECK` (`0` disables health checks for OpenAI endpoints)
- `LLM_HEALTHCHECK_TIMEOUT_MS`

### Search provider

- `SERP_API_KEY` (optional): enables SERP-backed web search

### App URLs

- `SITE_URL` (recommended): used to generate share/public links for published chats

### Streaming signature (optional)

- `AGENT_SIGNING_KEY` (optional): signs `persisted` SSE events so the client can verify that persisted message IDs and sources were not tampered with

### Rate limiting / proxies

- `CONVEX_TRUST_PROXY` (`1` trusts `X-Forwarded-For` for rate limiting)

### Planner tuning (optional)

- `PLANNER_MAX_KWS`
- `PLANNER_MAX_EXTRAS`
- `PLANNER_MAX_QUERIES`

### Debug logging (optional)

- `DEBUG_HTTP` (`1` enables verbose HTTP route logs)

## Docker runtime (self-host)

When running `server.mjs` (Docker or local), these apply:

- `CONVEX_SITE_URL` (required): `https://<deployment>.convex.site` (used to proxy `/api/*`)
- `PORT` (optional): defaults to `3000`
- `RATELIMIT_PUBLISH_MAX`, `RATELIMIT_PUBLISH_WINDOW_MS` (optional): publish endpoint throttling in the Node proxy server
