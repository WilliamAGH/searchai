"""
Services package for agent: web search client implementations.
"""

from .search import WebSearchClient, get_default_client

__all__ = ["WebSearchClient", "get_default_client"]
