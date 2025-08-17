/**
 * Tests for ContentWithCitations component
 * Verifies citation detection, rendering, and hover interactions
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ContentWithCitations } from "../../src/components/ContentWithCitations";
import React from "react";

describe("ContentWithCitations", () => {
  afterEach(() => {
    cleanup();
  });
  const mockSearchResults = [
    {
      title: "Example Article",
      url: "https://example.com/article",
      snippet: "This is an example article",
    },
    {
      title: "Wikipedia Page",
      url: "https://en.wikipedia.org/wiki/Test",
      snippet: "Wikipedia article about testing",
    },
    {
      title: "GitHub Repository",
      url: "https://github.com/user/repo",
      snippet: "A GitHub repository",
    },
  ];

  it("should render content without citations when no brackets present", () => {
    const content = "This is plain text without any citations.";

    render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    expect(
      screen.getByText("This is plain text without any citations."),
    ).toBeInTheDocument();
  });

  it("should convert domain citations to links", () => {
    const content =
      "This information comes from [example.com] and [en.wikipedia.org].";

    render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    // Check that links are created
    const exampleLink = screen.getByRole("link", { name: /example\.com/i });
    const wikiLink = screen.getByRole("link", { name: /en\.wikipedia\.org/i });

    expect(exampleLink).toHaveAttribute("href", "https://example.com/article");
    expect(wikiLink).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Test",
    );
  });

  it("should handle full URL citations", () => {
    const content = "Source: [https://example.com/article] has the answer.";

    render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    // Should extract domain and create link
    const links = screen.getAllByRole("link", { name: /example\.com/i });
    expect(links[0]).toHaveAttribute("href", "https://example.com/article");
  });

  it("should handle path citations like github.com/user/repo", () => {
    const content = "Check out [github.com/user/repo] for the code.";

    render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    const link = screen.getByRole("link", { name: /github\.com/i });
    expect(link).toHaveAttribute("href", "https://github.com/user/repo");
  });

  it("should not convert unmatched citations", () => {
    const content = "This [unknown.com] is not in search results.";

    render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    // Should remain as plain text
    expect(screen.getByText(/\[unknown\.com\]/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /unknown\.com/i }),
    ).not.toBeInTheDocument();
  });

  it("should handle hover events", () => {
    const onCitationHover = vi.fn();
    const content = "Information from [example.com].";

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
        onCitationHover={onCitationHover}
      />,
    );

    const link = container.querySelector("a");
    expect(link).toBeTruthy();

    // Hover over citation
    if (link) fireEvent.mouseEnter(link);
    expect(onCitationHover).toHaveBeenCalledWith("https://example.com/article");

    // Mouse leave
    if (link) fireEvent.mouseLeave(link);
    expect(onCitationHover).toHaveBeenCalledWith(null);
  });

  it("should apply highlight styling when hoveredSourceUrl matches", () => {
    const content = "Data from [example.com].";

    const { rerender, container } = render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
        hoveredSourceUrl={null}
      />,
    );

    let link = container.querySelector("a");

    // Initially not highlighted
    expect(link?.className).toContain("bg-gray-100");

    // Re-render with hover state
    rerender(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
        hoveredSourceUrl="https://example.com/article"
      />,
    );

    link = container.querySelector("a");
    // Should have highlight styling
    expect(link?.className).toContain("bg-yellow-200");
  });

  it("should handle multiple citations in one piece of content", () => {
    const content =
      "According to [example.com], [en.wikipedia.org] states that [github.com] is useful.";

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    // Query only within this render's container
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(3);

    expect(links[0]).toHaveAttribute("href", "https://example.com/article");
    expect(links[1]).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Test",
    );
    expect(links[2]).toHaveAttribute("href", "https://github.com/user/repo");
  });

  it("should handle empty search results", () => {
    const content = "This [example.com] won't be linked.";

    render(<ContentWithCitations content={content} searchResults={[]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/\[example\.com\]/)).toBeInTheDocument();
  });

  it("should handle markdown content with citations", () => {
    const content = "**Bold text** with [example.com] citation.";

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    // Bold text should be rendered
    const boldText = container.querySelector("strong");
    expect(boldText).toBeTruthy();
    expect(boldText?.textContent).toBe("Bold text");

    // Citation should be linked
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com/article");
  });

  it("should open links in new tab with security attributes", () => {
    const content = "Check [example.com] for details.";

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={mockSearchResults}
      />,
    );

    const link = container.querySelector("a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("ContentWithCitations - Duplicate Domain Handling", () => {
  it("should handle multiple search results from the same domain", () => {
    const searchResults = [
      {
        title: "Wikipedia Article 1",
        url: "https://en.wikipedia.org/wiki/React",
        snippet: "React article",
      },
      {
        title: "Wikipedia Article 2",
        url: "https://en.wikipedia.org/wiki/JavaScript",
        snippet: "JavaScript article",
      },
      {
        title: "Wikipedia Article 3",
        url: "https://en.wikipedia.org/wiki/Testing",
        snippet: "Testing article",
      },
    ];

    const content = "Information from [en.wikipedia.org] about various topics.";

    const { container } = render(
      <ContentWithCitations content={content} searchResults={searchResults} />,
    );

    const link = container.querySelector("a");
    // Should link to the last one in the array (current behavior)
    // This is a known limitation - it only stores one URL per domain
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Testing",
    );
  });

  it("should match specific paths when available", () => {
    const searchResults = [
      {
        title: "GitHub Repo 1",
        url: "https://github.com/facebook/react",
        snippet: "React repo",
      },
      {
        title: "GitHub Repo 2",
        url: "https://github.com/microsoft/typescript",
        snippet: "TypeScript repo",
      },
    ];

    const content = "Check [github.com/facebook/react] for the source.";

    const { container } = render(
      <ContentWithCitations content={content} searchResults={searchResults} />,
    );

    const link = container.querySelector("a");
    // Should match the specific path
    expect(link).toHaveAttribute("href", "https://github.com/facebook/react");
  });
});

describe("ContentWithCitations - Code Rendering", () => {
  it("should render inline code correctly", () => {
    const content =
      "Use `npm install` to install dependencies and [example.com] for docs.";

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={[
          {
            title: "Docs",
            url: "https://example.com",
            snippet: "Documentation",
          },
        ]}
      />,
    );

    // Should render code element
    const codeElement = container.querySelector("code");
    expect(codeElement).toBeTruthy();
    expect(codeElement?.textContent).toBe("npm install");

    // Should still render citation
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("should handle code blocks with citations", () => {
    const content =
      '```javascript\nconsole.log("hello");\n```\n\nSee [example.com] for more.';

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={[
          { title: "Example", url: "https://example.com", snippet: "Test" },
        ]}
      />,
    );

    // Should render code block
    const codeBlock = container.querySelector("pre code");
    expect(codeBlock).toBeTruthy();
    expect(codeBlock?.textContent).toContain('console.log("hello");');

    // Should render citation link
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com");
  });
});

describe("ContentWithCitations - Edge Cases", () => {
  it("should handle malformed brackets", () => {
    const content = "This [ is broken and ] this [example.com is not closed";

    render(
      <ContentWithCitations
        content={content}
        searchResults={[
          { title: "Test", url: "https://example.com", snippet: "Test" },
        ]}
      />,
    );

    // Malformed brackets should not break rendering
    expect(screen.getByText(/This \[ is broken and \]/)).toBeInTheDocument();
  });

  it("should handle empty brackets", () => {
    const content = "Empty [] brackets should not crash.";

    render(<ContentWithCitations content={content} searchResults={[]} />);

    expect(screen.getByText(/Empty \[\] brackets/)).toBeInTheDocument();
  });

  it("should handle special characters in domains", () => {
    const searchResults = [
      {
        title: "Subdomain Test",
        url: "https://api.example-test.co.uk/v1/docs",
        snippet: "API documentation",
      },
    ];

    const content = "API docs at [api.example-test.co.uk].";

    render(
      <ContentWithCitations content={content} searchResults={searchResults} />,
    );

    const link = screen.getByRole("link", {
      name: /api\.example-test\.co\.uk/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://api.example-test.co.uk/v1/docs",
    );
  });

  it("should match partial domain paths when domain looks valid", () => {
    const searchResults = [
      {
        title: "Nested Path",
        url: "https://docs.example.com/api/v2/reference",
        snippet: "API Reference",
      },
    ];

    const content = "Check the docs at [docs.example.com/api] for details.";

    const { container } = render(
      <ContentWithCitations content={content} searchResults={searchResults} />,
    );

    // Should match because domain includes "docs.example.com"
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute(
      "href",
      "https://docs.example.com/api/v2/reference",
    );
  });

  it("should handle numeric-looking citations without converting", () => {
    const content = "Old style citations [1] and [2] should not be linked.";

    const { container } = render(
      <ContentWithCitations
        content={content}
        searchResults={[
          { title: "Test", url: "https://example.com", snippet: "Test" },
        ]}
      />,
    );

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(0);
    expect(container.textContent).toContain("[1]");
    expect(container.textContent).toContain("[2]");
  });
});
