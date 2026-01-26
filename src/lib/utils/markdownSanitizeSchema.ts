/**
 * Shared sanitize schema for markdown rendering.
 * Single source of truth for allowed HTML elements and attributes.
 */

import { defaultSchema } from "hast-util-sanitize";
import type { Schema } from "hast-util-sanitize";

/**
 * Extended sanitize schema that allows common markdown elements.
 * Used by MarkdownWithCitations and ContentWithCitations.
 */
export const MARKDOWN_SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "u",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "blockquote",
    "hr",
    "strong",
    "em",
    "del",
    "br",
    "p",
    "ul",
    "ol",
    "li",
    "pre",
    "code",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: ["href", "target", "rel"],
    code: ["className"],
  },
};
