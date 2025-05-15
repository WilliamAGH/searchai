import io
import json
import os
import sys
from typing import Any

import requests
from crewai_tools import SerperDevTool
from django.conf import settings


class QuietSerperDevTool(SerperDevTool):
    """A modified version of SerperDevTool that suppresses the 'Using Tool' output."""

    def run(self, search_query: str, **kwargs: Any) -> str:
        """
        Run the search query but suppress the 'Using Tool' output.
        """
        original_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            result = super().run(search_query=search_query, **kwargs)
            return str(result)
        finally:
            sys.stdout = original_stdout


class WebSearchClient:
    """
    Simple wrapper around an external web-search API.
    Configure via SERPER_API_KEY and SERPER_SEARCH_URL in environment or Django settings.
    """

    def __init__(self, api_key: str, **kwargs: Any):
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
        Perform a web search using the Serper API directly.

        Args:
            query: The search query string.
            **kwargs: Supports 'n_results' or 'max_results', 'return_full_response'.

        Returns:
            If return_full_response=True, returns the complete API response as a dict.
            Otherwise, returns a list of organic search result dictionaries, or an empty list on error.
        """
        # First try using direct API call which is more reliable
        try:
            current_params = self.call_params.copy()

            # Override 'num' (n_results) if max_results or n_results is in runtime kwargs
            if "max_results" in kwargs:
                current_params["num"] = str(kwargs["max_results"])
            elif "n_results" in kwargs:
                current_params["num"] = str(kwargs["n_results"])

            post_data = {"q": query}

            response = requests.request(
                method="POST",
                url=self.search_url,
                headers=self.call_headers,
                params=current_params, # num, gl, hl, location for query string
                data=json.dumps(post_data),  # main query 'q' in body
            )
            response.raise_for_status()
            results_json = response.json()

            if "error" in results_json:
                print(f"Serper API Error: {results_json.get('error')}")
                return []

            # Return the full API response if requested
            if kwargs.get("return_full_response", False):
                return results_json

            organic_results = results_json.get("organic", [])
            if not isinstance(organic_results, list):
                print(f"Serper API 'organic' results not a list: {type(organic_results)}")
                return []

            return organic_results

        except Exception as e:
            # Fall back to default results if something goes wrong
            print(f"Direct API search failed: {e}")
            return [
                {
                    "title": "Search results unavailable",
                    "link": "https://example.com",
                    "snippet": f"The search service encountered an error. Please try again later. Query: {query}",
                },
            ]


def get_default_client() -> WebSearchClient | None:
    """
    Factory to create a WebSearchClient using environment variables or Django settings if available.
    """
    api_key_env = os.environ.get("SERPER_API_KEY")
    search_url_env = os.environ.get("SERPER_SEARCH_URL", "https://google.serper.dev/search")

    client_kwargs: dict[str, Any] = {}

    api_key = api_key_env

    # Prioritize Django settings if available, then env vars, then defaults
    try:
        api_key_django = getattr(settings, "SERPER_API_KEY", None)
        if api_key_django: # Django settings override env for API key if present
            api_key = api_key_django

        client_kwargs["search_url"] = getattr(settings, "SERPER_SEARCH_URL", search_url_env)
        client_kwargs["country"] = getattr(settings, "SERPER_COUNTRY", os.environ.get("SERPER_COUNTRY"))
        client_kwargs["location"] = getattr(settings, "SERPER_LOCATION", os.environ.get("SERPER_LOCATION"))
        client_kwargs["locale"] = getattr(settings, "SERPER_LOCALE", os.environ.get("SERPER_LOCALE"))
        n_results_settings = getattr(settings, "SERPER_N_RESULTS", os.environ.get("SERPER_N_RESULTS"))
        if n_results_settings is not None:
            client_kwargs["n_results"] = n_results_settings

    except (ImportError, AttributeError): # Django not installed or settings not configured
        client_kwargs["search_url"] = search_url_env
        if os.environ.get("SERPER_COUNTRY"): client_kwargs["country"] = os.environ.get("SERPER_COUNTRY")  # noqa: E701
        if os.environ.get("SERPER_LOCATION"): client_kwargs["location"] = os.environ.get("SERPER_LOCATION")  # noqa: E701
        if os.environ.get("SERPER_LOCALE"): client_kwargs["locale"] = os.environ.get("SERPER_LOCALE")  # noqa: E701
        if os.environ.get("SERPER_N_RESULTS"): client_kwargs["n_results"] = os.environ.get("SERPER_N_RESULTS")  # noqa: E701
        pass
    except Exception as e:
        print(f"Error loading Django settings for Serper: {e}")


    if not api_key:
        print("SERPER_API_KEY is not set in Django settings or environment variables.")
        return None

    final_client_kwargs = {k: v for k, v in client_kwargs.items() if v is not None}

    try:
        # api_key is passed separately to __init__
        return WebSearchClient(api_key=api_key, **final_client_kwargs)
    except Exception as e:
        print(f"Failed to initialize WebSearchClient: {e}")
        return None
