/**
 * SEO meta tag injection utilities for the static server.
 * Fetches OG metadata from the Convex endpoint and injects it
 * into the cached HTML template for crawler-visible meta tags.
 */

export const SITE_NAME = "Researchly";
export const SITE_URL = "https://researchly.bot";

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

// Escaped double-quote character used inside RegExp template strings so that
// the patterns remain readable without nested backslash escaping.
const REGEX_QUOTE = "\x22";

// Builds a regex that captures the opening portion of a <meta> tag's content
// attribute, allowing replacement of the value between quotes.  Uses lazy
// [\s\S]*? between the attr value and content= to handle tags where other
// attributes appear in between (safe for all meta tags).
function metaContentPattern(attributeName, attributeValue) {
  const RQ = REGEX_QUOTE;
  return new RegExp(
    `(<meta\\s+${attributeName}=${RQ}${attributeValue}${RQ}[\\s\\S]*?content=${RQ})[^${RQ}]*(${RQ})`,
  );
}

export function injectMetaTags({ html, meta, canonicalUrl }) {
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description);
  const safeUrl = escapeHtml(canonicalUrl);
  const fullTitle = `${safeTitle} · ${SITE_NAME}`;

  // Use replacer function (not string template) to prevent $-sign
  // interpretation in user-controlled titles (e.g., "Saved $100").
  let result = html.replace(
    /<title>[^<]*<\/title>/,
    () => `<title>${fullTitle}</title>`,
  );

  const replacements = [
    [metaContentPattern("property", "og:title"), fullTitle],
    [metaContentPattern("property", "og:description"), safeDesc],
    [metaContentPattern("property", "og:url"), safeUrl],
    [metaContentPattern("name", "twitter:title"), fullTitle],
    [metaContentPattern("name", "twitter:description"), safeDesc],
    [metaContentPattern("name", "twitter:url"), safeUrl],
    [metaContentPattern("name", "robots"), meta.robots],
  ];

  // Use replacer functions to avoid $-sign interpretation in user-controlled
  // values (e.g., a chat title containing "$100" would corrupt meta content
  // if passed as a replacement string where $1, $&, $` are special patterns).
  for (const [pattern, value] of replacements) {
    result = result.replace(
      pattern,
      (_, prefix, suffix) => `${prefix}${value}${suffix}`,
    );
  }

  // Update <link rel="canonical"> so individual public/shared chat pages are
  // indexed as distinct URLs (not attributed to the homepage).
  result = result.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    (_, prefix, suffix) => `${prefix}${safeUrl}${suffix}`,
  );

  return result;
}
