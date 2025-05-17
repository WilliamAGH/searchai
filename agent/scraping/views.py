import json
import logging

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET
from django.utils.html import escape

from ..celery_setup import (
    CELERY_AVAILABLE,
    _actual_celery_app,
    _celery_GroupResult,
    _CeleryBaseError,
    _CeleryBrokerError,
)

logger = logging.getLogger("agent.scraping.views")


def _get_diagnostics_context(request: HttpRequest, query_context: str, task_group_id_override: str | None = None) -> dict:
    """Helper to build context for diagnostics.html"""
    # This is a simplified version. A more robust solution might need to access
    # chat history length, actual system message tokens, etc., potentially from session
    # or by re-evaluating parts of chatbot_views logic.
    # For now, focus on scraped tokens.
    
    scraped_results = request.session.get(f"scraped_results_{query_context}", [])
    total_scraped_tokens = sum(item.get("token_count", 0) for item in scraped_results if item.get("status") == "success")

    # Placeholder values for other diagnostic items if not readily available
    # These would ideally be fetched or calculated accurately based on current chat state
    chat_history = request.session.get(f"chat_history_{query_context}", [])
    message_count = len(chat_history) + 1 # Approximation
    
    # Rough approximation of system message tokens, actual calculation is in chatbot_views
    # For simplicity, we'll just use scraped tokens here and assume others are handled by main chat view updates
    # or accept that this specific update might only refresh a part of tokens_in.
    # A more complete solution would involve a shared utility or more context passing.
    tokens_in = total_scraped_tokens # This is the key part we are updating
    
    # Try to get existing tokens_in from session if chatbot_interface_view set it,
    # then add our scraped_tokens. This is still an approximation.
    # A full recalculation as done in chatbot_views would be best if feasible here.
    # For now, this focuses on reflecting the *newly added* scraped tokens.
    # Let's assume chatbot_views.py will handle the full sum when it renders.
    # The OOB swap for diagnostics here will primarily show the effect of scraping.

    # Fallback: Get other diagnostic values from session if they were stored by chatbot_views,
    # otherwise use defaults.
    # This part is tricky because check_scraping_status is a separate request.
    # For a fully accurate diagnostic panel, it might be better for the polling
    # to trigger an update of a component that has access to the full chat context.
    # Given the current structure, we'll update what we can.

    # The most important part is that `tokens_in` reflects the scraped content.
    # The `chatbot_send_message_view` does a full diagnostic update, so this one
    # can be a bit more focused on the scraping aspect.

    # Let's retrieve the last known diagnostics from session if possible,
    # and update the tokens_in part based on scraping.
    last_diag_context = request.session.get(f"last_diagnostics_context_{query_context}", {})
    
    current_tokens_in = total_scraped_tokens # Start with scraped tokens
    # Add other token sources if available and makes sense for this partial update
    # For example, tokens from system messages (approximate if not fully calculated here)
    # And tokens from chat history
    
    # For simplicity and to avoid staleness, let's make tokens_in primarily reflect the scraped content's contribution
    # The main chatbot_send_message_view will provide the fully comprehensive diagnostic update.
    # This view's diagnostic update is a "bonus" to see scrape impact immediately.

    # Let's try to get the other values from the last full diagnostic update if available
    # This is to make the OOB swap less jarring if only tokens_in changes significantly.
    final_tokens_in = last_diag_context.get('tokens_in_base', 0) + total_scraped_tokens

    return {
        "message_count": last_diag_context.get('message_count', len(chat_history) + 1),
        "tokens_in": final_tokens_in, # This is the critical update
        "tokens_out": last_diag_context.get('tokens_out', 0),
        "results_count": last_diag_context.get('results_count', 0), # Search results, not scrape
        "history_count": len(chat_history),
        "query_context": query_context,
        "still_scraping_some": task_group_id_override is not None, # True if we pass a task_group_id
        "active_scrape_task_group_id": task_group_id_override,
    }


@require_GET
def check_scraping_status_view(request: HttpRequest) -> HttpResponse:
    query_context = request.GET.get("query_context")
    if not query_context:
        # Return a simple HTML error snippet if used via HTMX
        return HttpResponse("<p class='text-red-500'>Error: query_context is required.</p>", status=400)

    task_group_id = request.session.get(f"scrape_task_group_id_{query_context}")
    
    status_render_context = {
        "query_context": query_context,
        "status": "not_applicable",
        "message": "No active asynchronous scraping tasks for this context or Celery is not configured/enabled/initialized.",
    }

    if not task_group_id or not CELERY_AVAILABLE or not settings.USE_CELERY_FOR_SCRAPING or not _celery_GroupResult or not _actual_celery_app:
        html_content = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
        return HttpResponse(html_content)

    try:
        task_group_result = _celery_GroupResult.restore(task_group_id, app=_actual_celery_app)
        if not task_group_result:
            logger.warning(f"Could not restore task group result for ID: {task_group_id} using _celery_GroupResult.")
            status_render_context.update({
                "status": "unknown",
                "message": "Scraping task group ID found but result could not be restored (may have expired or broker issue).",
            })
            html_content = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
            return HttpResponse(html_content)

        completed_count = task_group_result.completed_count()
        total_tasks = len(task_group_result)

        if task_group_result.ready():
            successful_tasks = 0
            failed_tasks = 0
            final_scraped_items = []
            results_data = task_group_result.get(timeout=1.0) 

            for item_result in results_data:
                # Ensure token_count is present, default to 0 if not (e.g. older task results)
                if isinstance(item_result, dict) and "token_count" not in item_result:
                    item_result["token_count"] = 0
                
                if isinstance(item_result, dict) and item_result.get("status") == "success":
                    successful_tasks += 1
                    final_scraped_items.append(item_result)
                else:
                    failed_tasks += 1
                    original_link = item_result.get("link", "Unknown link") if isinstance(item_result, dict) else "Unknown link"
                    error_detail = item_result.get("error", "Unknown error") if isinstance(item_result, dict) else "Unknown error"
                    final_scraped_items.append({
                        "link": original_link, "content": "", "status": "failed_task",
                        "error": error_detail, "index": item_result.get("index", -1) if isinstance(item_result, dict) else -1,
                        "token_count": 0,
                    })
            
            request.session[f"scraped_results_{query_context}"] = final_scraped_items
            if f"scrape_task_group_id_{query_context}" in request.session:
                del request.session[f"scrape_task_group_id_{query_context}"]
            
            logger.info(f"Scraping task group {task_group_id} completed. Success: {successful_tasks}, Failed: {failed_tasks}")
            status_render_context.update({
                "status": "completed",
                "message": f"All {total_tasks} scraping tasks finished.",
                "successful_count": successful_tasks,
                "failed_count": failed_tasks,
                "total_count": total_tasks,
                "results": final_scraped_items, # Passed to template, might be used by it
            })
            
            indicator_html = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
            
            # Prepare context and render diagnostics for OOB swap
            # Pass None for task_group_id_override as it's completed
            diagnostics_context = _get_diagnostics_context(request, query_context, None) 
            diagnostics_html_content = render_to_string("agent/partials/diagnostics.html", diagnostics_context)
            
            # Combine indicator HTML with OOB swap for diagnostics
            # Ensure the hx-trigger for polling is NOT included in the completed indicator_html
            final_html = f"""
            {indicator_html}
            <div id="diagnostics" hx-swap-oob="innerHTML">
                {diagnostics_html_content}
            </div>
            """
            return HttpResponse(final_html)
        else:
            # Still pending
            logger.debug(f"Scraping task group {task_group_id} still pending. Completed: {completed_count}/{total_tasks}")
            status_render_context.update({
                "status": "pending",
                "message": f"Scraping in progress: {completed_count} of {total_tasks} tasks completed.",
                "completed_count": completed_count,
                "total_count": total_tasks,
            })
            # When pending, the scraping_status_indicator.html itself might contain hx-trigger for polling
            # Or the parent element in chatbot_interface.html can handle polling trigger.
            # For now, ensure the template `scraping_status_indicator.html` handles its own refresh button.
            # If auto-polling is desired, the template or its loader needs to add hx-trigger="every Xs"
            html_content = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
            return HttpResponse(html_content)

    except TimeoutError:
        logger.warning(f"Timeout while trying to get results for task group {task_group_id}. Assuming still pending.")
        status_render_context.update({
            "status": "pending", # Treat as pending to allow retry/refresh
            "message": "Fetching task results timed out, assuming still in progress.",
            "completed_count": "unknown",
            "total_count": "unknown",
        })
        html_content = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
        return HttpResponse(html_content)
    except (_CeleryBrokerError, _CeleryBaseError) as e:
        logger.error(f"Celery error checking status for task group {task_group_id} (query: {query_context}): {e!r}", exc_info=True)
        status_render_context.update({
            "status": "error", 
            "message": f"Error communicating with Celery: {str(e)}",
        })
        html_content = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
        return HttpResponse(html_content, status=500)
    except Exception as e:
        logger.error(f"Unexpected error checking scraping status for {task_group_id} (query: {query_context}): {e!r}", exc_info=True)
        status_render_context.update({
            "status": "error", 
            "message": f"An unexpected error occurred: {str(e)}",
        })
        html_content = render_to_string("agent/partials/scraping_status_indicator.html", status_render_context)
        return HttpResponse(html_content, status=500)


@require_GET
def view_scraped_json_result(request: HttpRequest, query_context: str, item_index: int) -> HttpResponse:
    """
    View for presenting scraped content in JSON format.
    
    Parameters:
    - query_context: The search query context from which scraping was initiated
    - item_index: The index of the scraped item to display, or -1 for all items
    """
    # Convert item_index from string to integer if necessary
    if isinstance(item_index, str):
        try:
            item_index = int(item_index)
        except (TypeError, ValueError):
            return HttpResponseBadRequest("Invalid item index.")
            
    try:
        # Check if scraping is still in progress
        task_group_id = request.session.get(f"scrape_task_group_id_{query_context}")
        if task_group_id and CELERY_AVAILABLE and settings.USE_CELERY_FOR_SCRAPING:
            return HttpResponse(
                '<div class="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 p-4 border border-yellow-300 dark:border-yellow-700 rounded">'
                '<p class="font-bold">Scraping in progress</p>'
                '<p>Content is still being scraped. Please try again when scraping is complete.</p>'
                '</div>',
                status=202,  # Accepted but processing
            )
            
        # Get scraped results from session
        session_key = f"scraped_results_{query_context}"
        scraped_results = request.session.get(session_key, [])
        
        if not scraped_results:
            return HttpResponse(
                '<div class="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 p-4 border border-yellow-300 dark:border-yellow-700 rounded">'
                '<p class="font-bold">No scraped content available</p>'
                '<p>No scraped content was found for this query context.</p>'
                '</div>',
                status=404,
            )
        
        # Function to truncate content for preview
        MAX_PREVIEW_LENGTH = 50000  # Set a reasonable maximum for preview

        def truncate_content_for_preview(item_data):
            if not isinstance(item_data, dict):
                return item_data
            
            item_copy = item_data.copy()
            content = item_copy.get("content", "")
            
            if content and len(content) > MAX_PREVIEW_LENGTH:
                truncated_content = content[:MAX_PREVIEW_LENGTH] + "... [Content truncated for preview, full length: " + str(len(content)) + " chars]"
                item_copy["content"] = truncated_content
            
            return item_copy
        
        # Check if we're displaying all scraped content (special case with index -1)
        if item_index == -1:
            # For all items view, truncate each item's content
            display_items = [truncate_content_for_preview(item) for item in scraped_results]
            pretty_json = json.dumps(display_items, indent=2)
            pretty_json_escaped = escape(pretty_json)
            html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto"><b>All Scraped Content:</b>\n{pretty_json_escaped}</pre>'
            return HttpResponse(html_response)
        
        # For regular item indexes, show individual scraped items
        if not 0 <= item_index < len(scraped_results):
            return HttpResponse(
                '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
                '<p class="font-bold">Invalid item index</p>'
                f'<p>Item index {item_index} is out of bounds (0-{len(scraped_results)-1}).</p>'
                '</div>',
                status=404,
            )
        
        item_data = scraped_results[item_index]
        
        # Handle empty content
        if item_data.get("status") == "success" and not item_data.get("content"):
            pretty_json = json.dumps(item_data, indent=2)
            pretty_json_escaped = escape(pretty_json)
            html_response = (
                f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">'
                f'<b>Scraped Content for URL {item_index + 1}:</b>\n{pretty_json_escaped}</pre>'
                f'<div class="mt-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100 p-4 border border-yellow-300 dark:border-yellow-700 rounded">'
                f'<p class="font-bold">No content extracted</p>'
                f'<p>The page was successfully accessed, but no meaningful content could be extracted.</p>'
                f'</div>'
            )
            return HttpResponse(html_response)
        
        # For regular display, truncate content if needed
        display_item = truncate_content_for_preview(item_data)
        pretty_json = json.dumps(display_item, indent=2)
        pretty_json_escaped = escape(pretty_json)
        html_response = f'<pre class="bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 p-4 border border-gray-300 dark:border-zinc-700 rounded whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto"><b>Scraped Content for URL {item_index + 1}:</b>\n{pretty_json_escaped}</pre>'
        return HttpResponse(html_response)
        
    except (_CeleryBrokerError, _CeleryBaseError) as e:
        # Handle Celery-specific errors
        logger.error(f"Celery error in view_scraped_json_result: {str(e)}", exc_info=True)
        return HttpResponse(
            '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
            '<p class="font-bold">Task Processing Error</p>'
            f'<p>Error communicating with the task queue: {str(e)}</p>'
            '</div>',
            status=500,
        )
    except json.JSONDecodeError as e:
        # Handle JSON formatting errors
        logger.error(f"JSON error in view_scraped_json_result: {str(e)}", exc_info=True)
        return HttpResponse(
            '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
            '<p class="font-bold">JSON Format Error</p>'
            f'<p>Error formatting the scraping results as JSON: {str(e)}</p>'
            '</div>',
            status=500,
        )
    except Exception as e:
        # Catch any other unexpected errors 
        logger.error(f"Unexpected error in view_scraped_json_result: {str(e)}", exc_info=True)
        return HttpResponse(
            '<div class="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100 p-4 border border-red-300 dark:border-red-700 rounded">'
            '<p class="font-bold">Unexpected Error</p>'
            f'<p>An error occurred while processing the request: {str(e)}</p>'
            '</div>',
            status=500,
        )
