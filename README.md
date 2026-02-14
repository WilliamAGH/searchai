# [Researchly](https://researchly.fyi)

AI-powered research chat built with Convex, Vite, & React.

![researchly.fyi](public/images/opengraph/researchly-screenshot-og.png)

- Use It Now: [researchly.fyi](https://researchly.fyi)
- Docs: [docs/README.md](docs/README.md)

## Features

- Web search + page scraping
- Streaming agent responses (SSE)
- Chat sharing + export (markdown/html/json/txt)
- Local-only mode and Convex-backed mode

## Development

```bash
npm install
cp .env.example .env.local

# Set VITE_CONVEX_URL in .env.local (https://<deployment>.convex.cloud)
# Optionally set CONVEX_DEPLOYMENT for Convex CLI commands

# Required for browser clients (CORS allowlist)
npx convex env set CONVEX_ALLOWED_ORIGINS "http://localhost:5173"

# Configure an AI provider key (choose one)
npx convex env set LLM_API_KEY "..."
# or: npx convex env set OPENAI_API_KEY "..."
# or: npx convex env set OPENROUTER_API_KEY "..."

npm run dev
```

## Docs

- [Development](docs/domains/development.md)
- [Configuration](docs/domains/configuration.md)
- [Testing](docs/contracts/testing.md)
- [API](docs/domains/api.md)
- [Deployment](docs/domains/deployment.md)
- [Architecture](docs/domains/architecture.md)
- Review [Context Pipeline](docs/domains/context-pipeline.md) to understand how conversational context is managed by agents/sub-agents, crawling, web search, and other tool calls.
- Review [Scraping and Crawling](docs/domains/scraping-crawling.md) for exact server-side runtime behavior, dependencies, and failure semantics.

## Scripts

- `npm run dev` (frontend + backend)
- `npm run build` / `npm run preview`
- `npm run lint` / `npm run typecheck`
- `npm run test:all`
- `npm run validate`

## Contributing

See `CONTRIBUTING.md`.

## Other Projects

- [Composer](https://composerai.app) — AI-assisted email application ([GitHub](https://github.com/WilliamAGH/ComposerAI))
- [TUI4J](https://github.com/WilliamAGH/tui4j) — Modern terminal user interface library for Java
- [Brief](https://williamcallahan.com/projects/brief) — Beautiful terminal AI chat with tool calling ([GitHub](https://github.com/WilliamAGH/brief))

## License

Copyright © 2026 [William Callahan](https://williamcallahan.com).

See `LICENSE.md`.
