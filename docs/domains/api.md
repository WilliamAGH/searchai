# API

Convex HTTP routes are served from your deployment’s `*.convex.site` domain.

## Base URLs

- Convex client URL (WebSocket + HTTP): `https://<deployment>.convex.cloud` (`VITE_CONVEX_URL`)
- Convex HTTP routes: `https://<deployment>.convex.site`

In production, the app calls `*.convex.site` directly. In local dev, `vite` proxies `/api/*` to `*.convex.site` when `VITE_CONVEX_URL` is configured.

## Endpoints

### Health

- `GET /health` → `{ "status": "ok", "timestamp": <ms> }`

### Search (unauthenticated)

- `POST /api/search`
  - Body: `{ "query": string, "maxResults"?: number }`
  - Returns `200` on empty queries, `429` on rate limit, and may return `500` with fallback results if upstream search fails.

### Scrape (unauthenticated)

- `POST /api/scrape`
  - Body: `{ "url": string }`
  - Returns `502` if the fetch/extract fails.

### Agent (streaming)

- `POST /api/ai/agent/stream`
  - Body:
    - `message` (string, required)
    - `chatId` (string, required; Convex `chats` ID)
    - `sessionId` (string, optional; UUIDv7)
    - `conversationContext` (string, optional)
    - `webResearchSources` (optional array; sanitized server-side)
  - Response: Server-Sent Events (SSE). Each frame is `data: { ... }\n\n` with a `type` field.

Event types used by the client:

- `progress`: `{ stage: "thinking" | "planning" | "searching" | "scraping" | "analyzing" | "generating", message: string, urls?, currentUrl?, queries?, sourcesUsed?, toolReasoning?, toolQuery?, toolUrl? }`
- `reasoning`: `{ content: string }`
- `content`: `{ delta: string }`
- `metadata`: `{ metadata: { workflowId, webResearchSources?, hasLimitations?, confidence?, answerLength? }, nonce?: string }`
- `complete`: workflow completion event (may include workflow summary data)
- `persisted`: `{ payload: { assistantMessageId, workflowId, answer, webResearchSources }, nonce: string, signature: string }`
- `error`: `{ error: string, ... }`

### Publish / Export

- `POST /api/publishChat` publishes an anonymous chat and returns share/public URLs.
- `GET /api/exportChat?shareId=...&format=json|markdown|html|txt` exports a chat (also supports `publicId`).
- `GET /api/chatTextMarkdown?shareId=...` returns the conversation as plain Markdown text (used for CLI-friendly share/public routes).
