# Development

## Prerequisites

- Node.js 22+
- npm
- A Convex deployment (for `VITE_CONVEX_URL`)

## Setup

```bash
npm install
cp .env.example .env.local
```

Set `VITE_CONVEX_URL` in `.env.local`. See [Configuration](configuration.md) for the full list of env vars.

## Run

```bash
# Frontend + Convex (recommended)
npm run dev

# Frontend only
npm run dev:frontend

# Convex only
npm run dev:backend
```

## Common commands

```bash
# Convex
npx convex env list
npx convex logs
npx convex dashboard

# Code quality
npm run lint
npm run typecheck
npm run format
```

## Validation and tests

```bash
npm run validate:quick
npm run validate
npm run test:all
```

More details: [Testing](testing.md).

## Convex `_generated` imports

Always import Convex types/APIs directly from the generated directories (do not re-export).

```ts
// Backend (convex/*.ts)
import { query, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// Frontend (src/**/*.tsx)
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
```

## Troubleshooting

- **403 Unauthorized origin**: Set `CONVEX_ALLOWED_ORIGINS` in your Convex deployment to include your local dev origin(s) (for example `http://localhost:5173`). See [Configuration](configuration.md#cors-origins-required).
- **404 on `/api/*` endpoints**: Deploy Convex HTTP routes (`npx convex dev --once` for dev, `npx convex deploy` for prod).
- **AI errors / missing tools**: Ensure an API key is configured (`LLM_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`) and that `LLM_BASE_URL` matches the provider you intend to use.
- **VS Code TS weirdness**: Run `npm run clean:vscode` and restart the TypeScript server.
