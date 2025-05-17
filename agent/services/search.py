"""
Web search functionality using Serper API
:author: William Callahan
"""
import io
import json
import logging
import os
import sys
from typing import Any

import requests
from crewai_tools import SerperDevTool
from django.conf import settings

logger = logging.getLogger("agent.services.search")

# Global session for connection pooling
_requests_session: requests.Session | None = None


class QuietSerperDevTool(SerperDevTool):
    """
    Modified SerperDevTool that suppresses console output

    - Inherits from CrewAI's SerperDevTool
    - Redirects stdout during search operations
    """

    def run(self, search_query: str, **kwargs: Any) -> str:
        """
        Executes a search query using the parent SerperDevTool while suppressing console output.
        
        Temporarily redirects standard output to prevent unwanted console messages during execution.
        Returns the search results as a string, or an error message if an exception occurs.
        """
        original_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            # Log before calling super().run() to see if this is reached
            logger.debug(f"QuietSerperDevTool: Attempting super().run() for query: {search_query}")
            result = super().run(search_query=search_query, **kwargs)
            logger.debug(f"QuietSerperDevTool: super().run() completed.")
            return str(result)
        except AttributeError as ae:
            # Specifically catch AttributeError that might be the 'super' object issue
            logger.error(
                f"QuietSerperDevTool: AttributeError during super().run(): {ae}. "
                "This might indicate the tool is used without proper CrewAI context.",
                exc_info=True
            )
            # Return a clear error message instead of letting it propagate ambiguously
            return f"Error in search tool: AttributeError - {ae}"
        except Exception as ex:
            # Catch any other exceptions from super().run()
            logger.error(f"QuietSerperDevTool: Exception during super().run(): {ex}", exc_info=True)
            return f"Error in search tool: {ex}"
        finally:
            sys.stdout = original_stdout
            logger.debug(f"QuietSerperDevTool: Restored stdout.")


class WebSearchClient:
    """
    Web search client using Serper API

    - Provides direct API access to Serper
    - Configurable via environment variables or Django settings
    - Handles API key management and request formatting
    """

    def __init__(self, api_key: str, **kwargs: Any):
        """
        Initializes the web search client with the provided Serper API key and configuration.
        
        Stores the API key in the environment for compatibility with other tools, sets up the API endpoint, and prepares request parameters and headers for subsequent search requests. Optional configuration can be provided for search region, language, location, and number of results.
        """
        # Store API key in environment for tools that expect it there
        os.environ["SERPER_API_KEY"] = api_key

        # Ensure n_results is int if passed as string from env/settings
        if "n_results" in kwargs and isinstance(kwargs["n_results"], str):
            try:
                kwargs["n_results"] = int(kwargs["n_results"])
            except ValueError:
                kwargs.pop("n_results")

        # Store all config for direct API calls
        self.tool_config = kwargs.copy()
        self.tool_config["api_key"] = api_key

        # For direct API calls
        self.api_key = api_key
        self.search_url = kwargs.get("search_url", os.getenv("SERPER_SEARCH_URL", "https://google.serper.dev/search"))

        # Prepare parameters for API calls
        _params = {
            "gl": kwargs.get("country", os.getenv("SERPER_COUNTRY")),
            "hl": kwargs.get("locale", os.getenv("SERPER_LOCALE")),
            "location": kwargs.get("location", os.getenv("SERPER_LOCATION")),
            "num": str(kwargs.get("n_results", os.getenv("SERPER_N_RESULTS", 10))),
        }
        self.call_params = {k: v for k, v in _params.items() if v is not None}
        self.call_headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }


    def search(self, query: str, **kwargs: Any) -> dict[str, Any] | list[dict[str, Any]]:
        """
        Performs a web search using the Serper API and returns search results.
        
        Args:
            query: The search query string.
            **kwargs: Optional overrides such as 'n_results', 'max_results', or 'return_full_response'.
        
        Returns:
            If 'return_full_response' is True, returns the complete API response as a dictionary.
            Otherwise, returns a list of organic search result dictionaries. If an error occurs or
            results are unavailable, returns a fallback list with a single dictionary indicating
            the search service is unavailable.
        """
        # First try using direct API call which is more reliable
        try:
            logger.debug(f"WebSearchClient.search: Starting search for query='{query}'")
            current_params = self.call_params.copy()

            # Override 'num' (n_results) if max_results or n_results is in runtime kwargs
            if "max_results" in kwargs:
                current_params["num"] = str(kwargs["max_results"])
            elif "n_results" in kwargs:
                current_params["num"] = str(kwargs["n_results"])

            post_data = {"q": query}

            # Use connection pooling session if available
            logger.debug("WebSearchClient.search: Calling get_requests_session()")
            session = get_requests_session()
            logger.debug(f"WebSearchClient.search: Got session: {type(session)}")

            logger.debug(f"WebSearchClient.search: Making POST request to {self.search_url} with params {current_params}")
            response = session.request(
                method="POST",
                url=self.search_url,
                headers=self.call_headers,
                params=current_params,
                data=json.dumps(post_data),
                timeout=getattr(settings, "REQUESTS_TIMEOUT", 10),
            )
            logger.debug(f"WebSearchClient.search: Request completed with status {response.status_code}")

            logger.debug("WebSearchClient.search: Calling response.raise_for_status()")
            response.raise_for_status()
            logger.debug("WebSearchClient.search: raise_for_status() passed")

            logger.debug("WebSearchClient.search: Calling response.json()")
            results_json = response.json()
            logger.debug("WebSearchClient.search: response.json() parsed")

            if "error" in results_json:
                logger.warning(f"Serper API Error in response: {results_json.get('error')}")
                return []

            # Return the full API response if requested
            if kwargs.get("return_full_response", False):
                logger.debug("WebSearchClient.search: Returning full response.")
                return results_json

            organic_results = results_json.get("organic", [])
            if not isinstance(organic_results, list):
                logger.warning(f"Serper API 'organic' results not a list: {type(organic_results)}")
                return []

            logger.debug(f"WebSearchClient.search: Returning {len(organic_results)} organic results.")
            return organic_results

        except Exception as e:
            # Fall back to default results if something goes wrong
            logger.error(f"WebSearchClient.search: Direct API search failed for query='{query}'. Error: {e!r}", exc_info=True)
            return [
                {
                    "title": "Search results unavailable",
                    "link": "https://example.com",
                    "snippet": f"The search service encountered an error. Please try again later. Query: {query}",
                },
            ]


def get_default_client() -> WebSearchClient | None:
    """
    Creates a WebSearchClient instance using configuration from Django settings, environment variables, or defaults.
    
    Returns:
        A configured WebSearchClient instance, or None if the API key is missing.
    
    Configuration priority:
        1. Django settings (highest)
        2. Environment variables (fallback)
        3. Hardcoded defaults (lowest)
    """
    api_key_env = os.environ.get("SERPER_API_KEY")
    search_url_env = os.environ.get("SERPER_SEARCH_URL", "https://google.serper.dev/search")

    client_kwargs: dict[str, Any] = {}

    api_key = api_key_env

    # Prioritize Django settings if available, then env vars, then defaults
    try:
        api_key_django = getattr(settings, "SERPER_API_KEY", None)
        if api_key_django:
            api_key = api_key_django

        client_kwargs["search_url"] = getattr(settings, "SERPER_SEARCH_URL", search_url_env)
        client_kwargs["country"] = getattr(settings, "SERPER_COUNTRY", os.environ.get("SERPER_COUNTRY"))
        client_kwargs["location"] = getattr(settings, "SERPER_LOCATION", os.environ.get("SERPER_LOCATION"))
        client_kwargs["locale"] = getattr(settings, "SERPER_LOCALE", os.environ.get("SERPER_LOCALE"))
        n_results_settings = getattr(settings, "SERPER_N_RESULTS", os.environ.get("SERPER_N_RESULTS"))
        if n_results_settings is not None:
            client_kwargs["n_results"] = n_results_settings

    except (ImportError, AttributeError):
        client_kwargs["search_url"] = search_url_env
        if os.environ.get("SERPER_COUNTRY"): client_kwargs["country"] = os.environ.get("SERPER_COUNTRY")  # noqa: E701
        if os.environ.get("SERPER_LOCATION"): client_kwargs["location"] = os.environ.get("SERPER_LOCATION")  # noqa: E701
        if os.environ.get("SERPER_LOCALE"): client_kwargs["locale"] = os.environ.get("SERPER_LOCALE")  # noqa: E701
        if os.environ.get("SERPER_N_RESULTS"): client_kwargs["n_results"] = os.environ.get("SERPER_N_RESULTS")  # noqa: E701
    except Exception as e:
        print(f"Error loading Django settings for Serper: {e}")

    if not api_key:
        logger.warning("SERPER_API_KEY is not set in Django settings or environment variables.")
        return None

    final_client_kwargs = {k: v for k, v in client_kwargs.items() if v is not None}

    try:
        return WebSearchClient(api_key=api_key, **final_client_kwargs)
    except Exception as e:
        logger.error(f"Failed to initialize WebSearchClient: {e}", exc_info=True)
        return None


def configure_requests_session(session: requests.Session) -> None:
    """
    Sets the global requests session for HTTP connection pooling.
    
    Replaces the default session used for outgoing HTTP requests with the provided
    session instance, enabling custom configuration and improved connection reuse.
    """
    global _requests_session
    _requests_session = session
    logger.info("Configured global requests session for connection pooling")


def get_requests_session() -> requests.Session:
    """
    Returns the global requests session, creating a new one if none is configured.
    
    If a session has not been set via `configure_requests_session`, a new `requests.Session`
    instance is created and returned. This enables connection pooling for HTTP requests.
    """
    global _requests_session
    if _requests_session is None:
        # Create a basic session with default settings
        _requests_session = requests.Session()
        logger.info("Created new requests session (no pooling configured)")
    return _requests_session
