"""
Services for web search and content retrieval
:author: William Callahan
"""

from .search import WebSearchClient, get_default_client

__all__ = ["WebSearchClient", "get_default_client"]
