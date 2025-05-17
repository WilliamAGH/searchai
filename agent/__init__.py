"""
Agent package with web search and LLM integration
:author: William Callahan
"""

from .services.search import WebSearchClient, get_default_client

__all__ = ["get_default_client", "WebSearchClient"]
