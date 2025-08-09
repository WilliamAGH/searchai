# AI-Powered Search Chat

Built with React + Vite on the frontend and Convex on the backend. Connected to Convex deployment: `diligent-greyhound-240`.

## Structure

- `src/` — React app and components
- `convex/` — Convex functions, auth, and HTTP routes (see `convex/http.ts`)

## Quick start

1. Install: `npm install`
2. Env (.env.local):
   - `VITE_CONVEX_URL=https://diligent-greyhound-240.convex.cloud`
   - `CONVEX_SITE_URL=https://diligent-greyhound-240.convex.site`
3. Convex env (required for AI/search):
   - `OPENROUTER_API_KEY` (required)
   - `SERP_API_KEY` (optional)
   - Push with: `npx convex env push`
4. Run dev servers: `npm run dev` (Vite + Convex)
5. Open `http://localhost:5173`

## HTTP endpoints

Defined in `convex/http.ts`:

- `POST /api/search`
- `POST /api/scrape`
- `POST /api/ai` (SSE streaming)

## Auth

Uses Convex Auth. Update providers in `convex/auth.config.ts` if needed.

## Deploy

`npx convex deploy`

## Convex quick commands

- Start local server: `npx convex dev`
- View logs: `npx convex logs` (or `npx convex logs --prod`)
- Open dashboard: `npx convex dashboard`
- Deploy functions: `npx convex deploy`
- Env sync: `npx convex env pull` / `npx convex env push`
- Schema sync: `npx convex schema pull` / `npx convex schema push`
- Docs: <https://docs.convex.dev/>

## Troubleshooting

- Streaming ends early or no response renders: verify env vars above and allow `*.convex.cloud` / `*.convex.site` in extensions/ad‑blockers.
- VS Code TS cache issues: `npm run clean:vscode` and restart the TS server.
