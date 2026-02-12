/**
 * Shared markdown configuration for citation-aware components.
 * Static values extracted to avoid unnecessary memoization.
 */

import React from "react";
import { defaultSchema } from "hast-util-sanitize";
import type { Schema } from "hast-util-sanitize";
import type { PluggableList } from "unified";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";

/**
 * Extended sanitize schema that allows common markdown elements.
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

/**
 * Remark plugins for GitHub-flavored markdown and line breaks.
 * Static - no need for memoization.
 */
export const REMARK_PLUGINS: PluggableList = [remarkGfm, remarkBreaks];

/**
 * Rehype plugins for HTML sanitization.
 * Static - no need for memoization.
 */
export const REHYPE_PLUGINS: PluggableList = [
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
];

/**
 * Table renderer that wraps <table> in a scrollable container.
 * Without this, setting `display: block` on <table> forces <thead> and
 * <tbody> into independent table contexts, breaking column alignment.
 * The wrapper takes ownership of overflow scrolling so the native
 * <table> retains `display: table` and columns align correctly.
 */
export const TableRenderer: NonNullable<Components["table"]> = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"table">) => (
  <div className="table-scroll-wrapper">
    <table {...props}>{children}</table>
  </div>
);

/**
 * Code block renderer that ensures children are stringified.
 * Static component - no need for useCallback wrapper.
 */
export const CodeRenderer: NonNullable<Components["code"]> = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"code">) => {
  // Safely convert children to string, handling various React node types
  const textContent =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : Array.isArray(children)
        ? children
            .map((c) =>
              typeof c === "string" || typeof c === "number" ? c : "",
            )
            .join("")
        : "";
  return (
    <code className={className} {...props}>
      {textContent}
    </code>
  );
};
