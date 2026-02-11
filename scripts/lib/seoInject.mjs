/**
 * SEO meta tag injection utilities for the static server.
 * Fetches OG metadata from the Convex endpoint and injects it
 * into the cached HTML template for crawler-visible meta tags.
 */

export const SITE_NAME = "SearchAI";
export const SITE_URL = "https://search-ai.io";

// Social bots (Twitterbot, Slackbot) must receive HTML within ~5s or they
// abandon the preview. 3s gives Convex time to respond while leaving headroom
// for the proxy to still serve the unmodified fallback before the bot gives up.
const OG_META_TIMEOUT_MS = 3000;

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fetch OG metadata from the Convex endpoint.
 * Returns a discriminated result so the caller can distinguish:
 *  - { ok: true, data }  — metadata resolved
 *  - { ok: true, data: null } — chat not found (404) or bad params (400)
 *  - { ok: false, error } — infrastructure failure (network, timeout, 5xx)
 */
export async function fetchOgMeta(convexSiteUrl, queryString) {
  const target = `${convexSiteUrl}/api/ogMeta?${queryString}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OG_META_TIMEOUT_MS);
  try {
    const resp = await fetch(target, { signal: controller.signal });
    if (resp.status === 404 || resp.status === 400) {
      return { ok: true, data: null };
    }
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    return { ok: true, data: await resp.json() };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function injectMetaTags({ html, meta, canonicalUrl }) {
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description);
  const safeUrl = escapeHtml(canonicalUrl);
  const fullTitle = `${safeTitle} · ${SITE_NAME}`;

  let result = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${fullTitle}</title>`,
  );

  const Q = "\x22"; // escaped double-quote for regex clarity in oxlint
  const replacements = [
    [
      new RegExp(
        `(<meta\\s+property=${Q}og:title${Q}\\s+content=${Q})[^${Q}]*(${Q})`,
      ),
      fullTitle,
    ],
    [
      new RegExp(
        `(<meta\\s+property=${Q}og:description${Q}[\\s\\S]*?content=${Q})[^${Q}]*(${Q})`,
      ),
      safeDesc,
    ],
    [
      new RegExp(
        `(<meta\\s+property=${Q}og:url${Q}\\s+content=${Q})[^${Q}]*(${Q})`,
      ),
      safeUrl,
    ],
    [
      new RegExp(
        `(<meta\\s+name=${Q}twitter:title${Q}\\s+content=${Q})[^${Q}]*(${Q})`,
      ),
      fullTitle,
    ],
    [
      new RegExp(
        `(<meta\\s+name=${Q}twitter:description${Q}[\\s\\S]*?content=${Q})[^${Q}]*(${Q})`,
      ),
      safeDesc,
    ],
    [
      new RegExp(
        `(<meta\\s+name=${Q}twitter:url${Q}\\s+content=${Q})[^${Q}]*(${Q})`,
      ),
      safeUrl,
    ],
    [
      new RegExp(
        `(<meta\\s+name=${Q}robots${Q}\\s+content=${Q})[^${Q}]*(${Q})`,
      ),
      meta.robots,
    ],
  ];

  for (const [pattern, value] of replacements) {
    result = result.replace(pattern, `$1${value}$2`);
  }
  return result;
}
