"""
Django views for search functionality
:author: William Callahan
"""
import json
import logging
from typing import Any, cast

from django.http import (  # type: ignore[attr-defined]
    HttpRequest,
    HttpResponse,
    HttpResponseBadRequest,
)
from django.shortcuts import render
from django.utils.html import escape
from django.views.decorators.http import require_GET

from .services.search import get_default_client

logger = logging.getLogger("agent.search_views")


@require_GET
def search_view(request: HttpRequest) -> HttpResponse:
    """
    Handles web search requests and renders search results or the search form.
    
    Processes search queries submitted via the 'q' query parameter, performs a search using the default client, and stores both raw results and the full API response in the session for later retrieval. Supports both full-page rendering and partial updates for HTMX requests. Displays error messages if the search client is unavailable or if an error occurs during the search.
    """
    query: str = cast(str, request.GET.get("q", ""))
    search_results: list[dict[str, Any]] = []
    error_message = None

    if query:
        try:
            client = get_default_client()
            if client:
                organic_results = client.search(query, max_results=10)
                raw_results: list[dict[str, Any]] = cast(list[dict[str, Any]], organic_results)

                session_key_raw_results = f"search_raw_results_{query}"
                request.session[session_key_raw_results] = raw_results

                search_results = [
                    {
                        "title": r.get("title"),
                        "link": r.get("link"),
                        "snippet": r.get("snippet") or r.get("content") or r.get("description"),
                        "index": idx,
                    }
                    for idx, r in enumerate(raw_results)
                ]

                if search_results:
                    try:
                        full_response = client.search(query, max_results=10, return_full_response=True)
                        session_key_full_response = f"search_full_response_{query}"
                        request.session[session_key_full_response] = full_response
                    except Exception as e:
                        logger.warning(f"Failed to get full API response: {str(e)}")
            else:
                error_message = "Search service client not available."
        except Exception as e:
            error_message = f"An error occurred during search: {str(e)}"
            logger.error(f"Search error for query '{query}': {str(e)}", exc_info=True)

    logger.info(f"Search request: query='{query}', results={len(search_results)}, error={error_message is not None}")

    if hasattr(request, "htmx") and request.htmx:  # type: ignore[attr-defined]
        logger.debug(f"HTMX request for query: '{query}', results: {len(search_results)}")
        return render(
            request,
            "agent/partials/search_results.html",
            {"results": search_results, "query": query, "error_message": error_message},
        )

    return render(request, "agent/search.html", {"query": query, "results": search_results, "error_message": error_message})


@require_GET
def view_full_json_result(request: HttpRequest, query: str, result_index: int) -> HttpResponse:
    """
    Displays formatted JSON details for a search result or the full API response.
    
    If the result index is -1, returns the full API response stored in the session for the given query. Otherwise, returns the JSON data for the specified search result index. Responds with informative HTML error messages if the requested data is unavailable or if an error occurs.
    """
    if isinstance(result_index, str):
        try:
            result_index = int(result_index)
        except (TypeError, ValueError):
            return HttpResponseBadRequest("Invalid result index.")
    try:
        if result_index == -1:
            session_key_full_response = f"search_full_response_{query}"
            full_response = request.session.get(session_key_full_response)

            if full_response:
                try:
                    pretty_json = json.dumps(full_response, indent=2)
                    pretty_json_escaped = escape(pretty_json)
                    html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto">{pretty_json_escaped}</pre>'
                    return HttpResponse(html_response)
                except Exception as e:
                    logger.error(f"Error processing full API response: {str(e)}", exc_info=True)
                    return HttpResponse(f"Error processing full API response: {str(e)}", status=500)
            else:
                return HttpResponse(
                    '<div class="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 p-4 border border-yellow-300 dark:border-yellow-700 rounded">'
                    '<p class="font-bold">Full API response is not available</p>'
                    '<p>The complete search API response was not successfully stored in session.</p>'
                    '</div>',
                    status=404,
                )

        session_key_raw_results = f"search_raw_results_{query}"
        raw_results_list = request.session.get(session_key_raw_results, [])

        if not raw_results_list or not isinstance(raw_results_list, list):
            return HttpResponse(
                '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
                '<p class="font-bold">No results available</p>'
                '<p>Search results not found in session or have an invalid format.</p>'
                '</div>',
                status=404,
            )

        if not 0 <= result_index < len(raw_results_list):
            return HttpResponse(
                '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
                '<p class="font-bold">Invalid result index</p>'
                f'<p>Result index {result_index} is out of bounds (0-{len(raw_results_list)-1}).</p>'
                '</div>',
                status=404,
            )

        result_data = raw_results_list[result_index]
        pretty_json = json.dumps(result_data, indent=2)
        pretty_json_escaped = escape(pretty_json)
        html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto"><b>Individual Search Result:</b>\n{pretty_json_escaped}</pre>'
        return HttpResponse(html_response)

    except Exception as e:
        logger.error(f"Unexpected error in view_full_json_result: {str(e)}", exc_info=True)
        return HttpResponse(
            '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
            '<p class="font-bold">Unexpected error</p>'
            f'<p>An error occurred while processing the request: {str(e)}</p>'
            '</div>',
            status=500,
        )
