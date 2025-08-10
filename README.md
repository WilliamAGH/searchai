# AI-Powered Search Chat

Built with React + Vite on the frontend and Convex on the backend.

## Architecture Overview

- **Frontend**: React + Vite app served as static files
- **Backend**: Convex serverless functions handle all API logic
- **API Endpoints**: HTTP routes in Convex serve unauthenticated users
- **Real-time**: Convex mutations/actions for authenticated users

### Recent Improvements (Overview)
- Context-aware planner with deterministic query augmentation and anchor queries for higher search relevance (auth + unauth flows).
- Non-blocking topic-change suggestions (banner) with stricter gating, cooldowns, and Enter-to-send preserved.
- Shared DRY summarization (`buildContextSummary`) used by planner and generation paths.

## Structure

- `src/` — React app and components
- `convex/` — Convex functions, auth, and HTTP routes (see `convex/http.ts`)

## Initial Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` file:
```env
# Required: Your Convex deployment URL
VITE_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOYMENT=your-deployment-name
```

### 3. Set Convex Environment Variables

**CRITICAL**: These must be set in your Convex deployment, not just locally!

```bash
# Required for AI functionality
npx convex env set OPENROUTER_API_KEY "sk-or-v1-your-key-here"

# Optional: For enhanced search
npx convex env set SERP_API_KEY "your-serp-api-key"

# List all env vars to verify
npx convex env list
```

### 4. Deploy Convex Functions

**IMPORTANT**: Always deploy Convex functions when you:
- Clone the repository
- Change any file in `convex/` directory
- Update environment variables
- Switch between dev/prod deployments

```bash
# Deploy to dev environment
npx convex dev --once

# Or deploy to production
npx convex deploy --prod
```

### 5. Run Development Server
```bash
npm run dev
```

## Deployment Guide

### When to Deploy Convex Functions

You MUST deploy Convex functions when:
1. **Initial setup** - First time setting up the project
2. **Code changes** - Any changes to files in `convex/` directory
3. **Environment updates** - After setting new environment variables
4. **HTTP route changes** - Modifications to `convex/http.ts`
5. **Schema changes** - Updates to database schema

### Development Deployment

```bash
# Start dev server (auto-deploys on file changes)
npx convex dev

# Or deploy once without watching
npx convex dev --once
```

### Production Deployment

```bash
# Set production environment variables first
npx convex env set OPENROUTER_API_KEY "your-key" --prod
npx convex env set SERP_API_KEY "your-key" --prod

# Deploy to production
npx convex deploy --prod

# Build frontend for production
npm run build
```

### Docker Deployment

```bash
# Build with required Convex URL
docker build \
  --build-arg VITE_CONVEX_URL=https://your-deployment.convex.cloud \
  -t searchai-app .

# Run container
docker run -p 3000:3000 searchai-app
```

**Note**: The Docker container only serves the frontend. Convex functions run in Convex's cloud, not in your container.

## API Endpoints

HTTP endpoints for unauthenticated users (served by Convex):

- `POST {CONVEX_URL}/api/search` - Web search
- `POST {CONVEX_URL}/api/scrape` - URL content extraction  
- `POST {CONVEX_URL}/api/ai` - AI response generation (SSE streaming)

## Environment Variables Reference

### Frontend Variables (build-time)
- `VITE_CONVEX_URL` - Your Convex deployment URL (required)

### Convex Backend Variables (runtime)
Set these using `npx convex env set`:
- `OPENROUTER_API_KEY` - OpenRouter API key for AI responses (required)
- `SERP_API_KEY` - SerpAPI key for web search (optional)
- `SITE_URL` - Your app's public URL (for auth callbacks)

#### Planner & Search Relevance Tunables (optional)
These control deterministic query augmentation that fuses the latest user message with salient context keywords for substantially more relevant web searches.

- `PLANNER_MAX_KWS` (default: `6`): Max number of context keywords extracted from the rolling summary + latest message.
- `PLANNER_MAX_EXTRAS` (default: `4`): Max number of missing keywords to append to each proposed query.
- `PLANNER_MAX_QUERIES` (default: `6`): Cap on the total number of queries sent downstream after augmentation.

Examples (development):
```bash
npx convex env set PLANNER_MAX_KWS 8
npx convex env set PLANNER_MAX_EXTRAS 5
npx convex env set PLANNER_MAX_QUERIES 6
```

Examples (production):
```bash
npx convex env set PLANNER_MAX_KWS 8 --prod
npx convex env set PLANNER_MAX_EXTRAS 5 --prod
npx convex env set PLANNER_MAX_QUERIES 6 --prod
```

Notes:
- The planner always includes an “anchor” query that starts with the exact new message and appends top context keywords.
- When the LLM planner is unavailable or skipped, a deterministic fallback still augments at least one query with context keywords.

## Common Issues & Solutions

### "AI generation failed with exception: Object"
**Cause**: Missing `OPENROUTER_API_KEY` in Convex deployment
**Solution**:
```bash
npx convex env set OPENROUTER_API_KEY "your-key"
```

### "404 errors on /api/search, /api/scrape, etc."
**Cause**: Convex HTTP routes not deployed
**Solution**:
```bash
npx convex dev --once  # For dev
# or
npx convex deploy --prod  # For production
```

### "Search returns 0 results"
**Cause**: Missing search API keys or incorrect deployment
**Solution**:
1. Verify Convex is deployed: `npx convex dashboard`
2. Check env vars: `npx convex env list`
3. Redeploy: `npx convex dev --once`

### Frontend not connecting to Convex
**Cause**: Wrong `VITE_CONVEX_URL` or not rebuilt after change
**Solution**:
1. Verify URL in `.env.local`
2. Rebuild frontend: `npm run build`
3. For Docker: Rebuild with correct build arg

## Quick Commands

```bash
# Development
npm run dev              # Start dev server (Vite + Convex)
npx convex dev          # Start Convex dev deployment
npx convex logs         # View function logs

# Deployment
npx convex deploy       # Deploy to production
npm run build          # Build frontend for production

# Environment Management
npx convex env set KEY "value"  # Set environment variable
npx convex env list             # List all env vars
npx convex dashboard            # Open Convex dashboard

# Debugging
npx convex logs --prod         # View production logs
npx convex functions list      # List deployed functions
```

## Testing

```bash
# Lightweight smoke tests
npm test

# Notes:
# - Some environments (e.g., sandboxed CI) may restrict Node’s IPC/listen,
#   which can prevent the dev-time test runner from starting.
# - Tests include basic checks for search helpers and query-augmentation heuristics.
```

## Troubleshooting

- **Streaming issues**: Allow `*.convex.cloud` / `*.convex.site` in ad-blockers

## Planner & Relevance: How It Works

- The backend builds a DRY conversation summary using `buildContextSummary` (Convex), which combines the rolling summary with the most recent turns.
- The planner (when enabled) proposes queries; we then deterministically augment them by appending a few high-signal keywords from the summary + latest message and add an anchor query based on the exact new ask.
- The unauthenticated client path also strengthens the first search query with recent, high-signal keywords extracted locally.

This ensures every search includes both the user’s latest intent and the most relevant context from the conversation.

## Topic-Change Suggestions (Banner)

- The banner is advisory only and never blocks sending; pressing Enter always sends your message.
- Sensitivity is tuned to reduce noise and shown with a per-chat cooldown. You can adjust constants in `src/components/ChatInterface.tsx` if needed:
  - `PROMPT_MIN_WORDS`: minimum words before considering a suggestion.
  - `PROMPT_COOLDOWN_MS`: cooldown between suggestions per chat.
  - `CHAT_COOLDOWN_MS`: planner call cooldown per chat.
  - Similarity thresholds and indicator phrases are defined near the top of the file.

### Configuration (defaults)

| Constant | Default | Purpose |
| --- | ---: | --- |
| `TOPIC_CHANGE_SIMILARITY_THRESHOLD` | `0.1` | Lower overlap → more confident new-topic signal. |
| `TOPIC_CHANGE_MIN_WORD_LENGTH` | `4` | Ignore very short tokens when comparing topics. |
| `PROMPT_MIN_WORDS` | `16` | Require substantive input before suggesting a new chat. |
| `CHAT_COOLDOWN_MS` | `45000` | Minimum time between planner calls per chat. |
| `PROMPT_COOLDOWN_MS` | `180000` | Minimum time between banner suggestions per chat. |
| `TOPIC_CHANGE_INDICATORS` | patterns | Explicit phrases (e.g., “switch to…”, “unrelated…”) that nudge detection. |
- **VS Code TS issues**: Run `npm run clean:vscode` and restart TS server
- **Auth issues**: Verify `SITE_URL` matches your deployment URL
- **API failures**: Check Convex logs with `npx convex logs`
