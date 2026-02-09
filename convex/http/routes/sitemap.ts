/**
 * Sitemap HTTP route
 * - Serves /sitemap.xml with paginated public chat entries
 * - Respects the 50,000 URL sitemaps protocol limit
 */

import type { HttpRouter } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "../../_generated/server";
import { httpAction } from "../../_generated/server";
import { publicCorsResponse } from "../cors";
import {
  SITEMAP_DEFAULT_BATCH_SIZE,
  SITEMAP_MAX_URLS,
} from "../../sitemap/constants";

type SitemapEntry = { publicId: string; updatedAt: number };

type SitemapEntriesPage = {
  entries: Array<SitemapEntry>;
  nextCursor?: string;
  isDone: boolean;
};

// Convex's generated `api` type triggers "Type instantiation is excessively
// deep" (TS2589) when used with `ctx.runQuery` in this file.
// `makeFunctionReference` is the documented Convex escape hatch for this
// TypeScript recursion-depth limitation (see [TY1a] exception).
const listPublicChatSitemapEntriesRef = makeFunctionReference<
  "query",
  { cursor?: string; limit?: number },
  SitemapEntriesPage
>("sitemap:listPublicChatSitemapEntries");

function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveSiteUrl(request: Request): string {
  const configured = normalizeSiteUrl((process.env.SITE_URL || "").trim());
  if (configured) {
    return configured;
  }
  return normalizeSiteUrl(new URL(request.url).origin);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toIsoDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    console.warn("[WARN] Invalid sitemap timestamp", { timestamp });
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

async function loadPublicEntries(ctx: ActionCtx): Promise<Array<SitemapEntry>> {
  const entries: Array<SitemapEntry> = [];
  let cursor: string | undefined = undefined;

  // Reserve one slot for the homepage <url> that buildSitemapXml always includes
  const maxEntries = SITEMAP_MAX_URLS - 1;

  while (entries.length < maxEntries) {
    const page: SitemapEntriesPage = await ctx.runQuery(
      listPublicChatSitemapEntriesRef,
      {
        cursor,
        limit: SITEMAP_DEFAULT_BATCH_SIZE,
      },
    );

    const remainingCapacity = maxEntries - entries.length;
    entries.push(...page.entries.slice(0, remainingCapacity));

    if (page.isDone || !page.nextCursor) {
      break;
    }

    cursor = page.nextCursor;
  }

  return entries;
}

function buildSitemapXml(
  baseUrl: string,
  entries: Array<SitemapEntry>,
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${escapeXml(`${baseUrl}/`)}</loc>`,
    "  </url>",
  ];

  for (const entry of entries) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(`${baseUrl}/p/${entry.publicId}`)}</loc>`);
    lines.push(`    <lastmod>${toIsoDate(entry.updatedAt)}</lastmod>`);
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return lines.join("\n");
}

export function registerSitemapRoutes(http: HttpRouter) {
  http.route({
    path: "/sitemap.xml",
    method: "GET",
    handler: httpAction(async (ctx, request): Promise<Response> => {
      const origin = request.headers.get("Origin");

      try {
        const siteUrl = resolveSiteUrl(request);
        const entries = await loadPublicEntries(ctx);
        const body = buildSitemapXml(siteUrl, entries);

        return publicCorsResponse({
          body,
          status: 200,
          origin,
          contentType: "application/xml; charset=utf-8",
          extraHeaders: {
            "Cache-Control": "public, max-age=300",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[ERROR] SITEMAP GENERATION:", message, error);
        return publicCorsResponse({
          body: `<?xml version="1.0" encoding="UTF-8"?>\n<error>${escapeXml(message)}</error>`,
          status: 500,
          origin,
          contentType: "application/xml; charset=utf-8",
        });
      }
    }),
  });
}
