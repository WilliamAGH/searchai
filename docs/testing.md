# Testing

This repo uses:

- **Vitest** for unit tests
- **Playwright** for browser tests (smoke + integration)

## Unit tests (Vitest)

```bash
npm run test
```

Useful variants:

- `npm run test:watch`
- `npm run test:single` (single-fork, faster iteration)
- `npm run test:ci`

## Browser tests (Playwright)

Playwright is included as a dev dependency, and `npm install` runs `npm run playwright:install` to install Chromium.

```bash
npm run test:playwright
```

Smoke tests:

```bash
npm run test:smoke
```

Proxy runtime (serves `dist/` via `server.mjs` and proxies `/api/*` to `CONVEX_SITE_URL`):

```bash
PLAYWRIGHT_RUNTIME=proxy CONVEX_SITE_URL="https://<deployment>.convex.site" npm run test:smoke
```

Integration tests:

```bash
npm run test:integration
```
