# search-ai.io

AI-powered search chat built with React + Vite and Convex.

![search-ai.io](public/images/opengraph/searchai-io-og.png)

- Live: https://search-ai.io
- Docs: [docs/README.md](docs/README.md)

## Quick start

```bash
npm install
cp .env.example .env.local

# Set VITE_CONVEX_URL in .env.local (https://<deployment>.convex.cloud)

# Required for browser clients (CORS allowlist)
npx convex env set CONVEX_ALLOWED_ORIGINS "http://localhost:5173"

# Configure an AI provider key (choose one)
npx convex env set LLM_API_KEY "..."
# or: npx convex env set OPENAI_API_KEY "..."
# or: npx convex env set OPENROUTER_API_KEY "..."

npm run dev
```

## Docs

- [Development](docs/development.md)
- [Configuration](docs/configuration.md)
- [API](docs/api.md)
- [Deployment](docs/deployment.md)
- [Architecture](docs/architecture.md)

## Scripts

- `npm run dev` (frontend + backend)
- `npm run build` / `npm run preview`
- `npm run lint` / `npm run typecheck`
- `npm run test:all`
- `npm run validate`

## License

UNLICENSED
