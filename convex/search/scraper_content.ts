"use node";

import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

const cleanText = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

const stripJunk = ($: CheerioAPI) => {
  $("script, style, nav, footer, header, aside, noscript, iframe").remove();
  $('[aria-hidden="true"]').remove();
  $('[role="presentation"]').remove();
  $(".ads, .ad, .advertisement, .promo, .sidebar").remove();
};

export const extractPageMetadata = ($: CheerioAPI) => {
  const fallbackTitle =
    $("h1").first().text().trim() || $("h2").first().text().trim();
  return {
    title: $("title").text().trim() || fallbackTitle,
    description: $('meta[name="description"]').attr("content"),
    ogTitle: $('meta[property="og:title"]').attr("content"),
    ogDescription: $('meta[property="og:description"]').attr("content"),
    author: $('meta[name="author"]').attr("content"),
    publishedDate: $('meta[property="article:published_time"]').attr("content"),
    jsonLd: $('script[type="application/ld+json"]').first().html(),
  };
};

const extractLargestTextBlock = ($: CheerioAPI): string => {
  let bestNode: Element | null = null;
  let bestLen = 0;
  $("p, article, section, div").each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > bestLen) {
      bestLen = text.length;
      bestNode = el;
    }
  });
  if (bestNode) {
    return cleanText($(bestNode).text());
  }
  return "";
};

export const extractMainContent = ($: CheerioAPI): string => {
  stripJunk($);
  const main =
    $("article").first().text() ||
    $("main").first().text() ||
    $('[role="main"]').first().text() ||
    $(".content").first().text() ||
    $(".post").first().text();

  const cleaned = cleanText(main);
  if (cleaned.length > 300) return cleaned;

  const largest = extractLargestTextBlock($);
  if (largest.length > 0) return largest;

  return cleanText($("body").text());
};

/**
 * Detect if a page likely needs JavaScript rendering for full content.
 * Must be called BEFORE stripJunk() since it checks for noscript elements.
 */
export const needsJsRendering = (
  $: CheerioAPI,
  textLength: number,
): boolean => {
  const hasReactRoot = $("#root, #__next, #app").length > 0;
  const hasNoscript = $("noscript").text().toLowerCase().includes("javascript");
  const minimalContent = textLength < 500;
  return (hasReactRoot && minimalContent) || hasNoscript;
};

export const normalizeScrapedText = (text: string): string => cleanText(text);
