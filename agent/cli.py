#!/usr/bin/env python3
"""
Main CLI entry point for SearchAI Web Search.
"""
from __future__ import annotations

# Standard library imports
import os
from typing import Any

# Third-party imports
import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

# Local application imports
from agent.services.search import get_default_client
from agent.utils.warning_suppressor import *  # noqa: F403

app = typer.Typer()
console = Console()

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

@app.command()
def search(query: list[str]) -> None:
    """Search the web for the given query."""
    client = get_default_client()
    response: dict[str, Any] = client.search(" ".join(query))

    # Extract organic results from response
    organic_results = response.get("organic", [])

    table = Table(title=f"Search Results for: {' '.join(query)}")
    table.add_column("Title")
    table.add_column("Link")
    table.add_column("Snippet")

    for result in organic_results:
        table.add_row(
            str(result.get("title", "")),
            str(result.get("link", "")),
            str(result.get("snippet", "")),
        )
    console.print(table)

if __name__ == "__main__":
    app()
