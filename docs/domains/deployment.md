# Deployment

## Convex (backend)

Deploy Convex functions whenever you change code under `convex/` or update Convex runtime env vars.

```bash
# Dev (watch)
npx convex dev

# Dev (one-shot)
npx convex dev --once

# Production
npx convex deploy
```

Set required env vars in the Convex deployment (at minimum: `CONVEX_ALLOWED_ORIGINS` and an AI provider key). See [Configuration](configuration.md).

## Vite (frontend)

`VITE_CONVEX_URL` is build-time configuration.

```bash
npm run build
```

## Docker (self-hosted)

The Docker image serves the built frontend and proxies `/api/*` to your Convex `*.convex.site` domain.

```bash
docker build \
  --build-arg VITE_CONVEX_URL=https://<deployment>.convex.cloud \
  -t researchly-bot .

docker run \
  -e CONVEX_SITE_URL=https://<deployment>.convex.site \
  -p 3000:3000 \
  researchly-bot
```

Optional:

- `PORT` to change the listen port
- `RATELIMIT_PUBLISH_MAX` / `RATELIMIT_PUBLISH_WINDOW_MS` to throttle publish calls in the Node proxy
