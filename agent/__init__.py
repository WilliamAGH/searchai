"""
Agent package: simple web-search agent functionality.
"""

from .services.search import WebSearchClient, get_default_client

__all__ = ["get_default_client", "WebSearchClient"]
