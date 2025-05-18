"""Scraping task orchestration and management
:author: William Callahan
"""
import logging
from typing import Any

import tiktoken
from django.conf import settings
from django.http import HttpRequest

from ..celery_setup import (
    CELERY_AVAILABLE,
    _actual_celery_app,
    _actual_scrape_url_task,
    _celery_group,
    _celery_GroupResult,
    _CeleryBaseError,
    _CeleryBrokerError,
)
from ..services.scraper import scrape_url

logger = logging.getLogger("agent.scraping.orchestration")

def dispatch_scraping_tasks(
    request: HttpRequest, query_context: str, links_to_scrape: list[tuple[str, int]],
) -> tuple[list[dict[str, Any]], str | None, bool]:
    """
    Dispatch scraping tasks synchronously or via Celery

    Args:
        request: HTTP request object containing session data
        query_context: Query string for context and identification
        links_to_scrape: List of URL and index pairs to scrape

    Returns:
        Tuple containing:
        - List of items with initial scraping status
        - Celery task group ID if applicable, else None
        - Boolean indicating if scraping is pending
    """
    scraped_items_initial: list[dict[str, Any]] = []
    active_scrape_task_group_id: str | None = None
    scraping_pending_initial = False

    if not links_to_scrape:
        return scraped_items_initial, active_scrape_task_group_id, scraping_pending_initial

    use_celery = settings.USE_CELERY_FOR_SCRAPING and CELERY_AVAILABLE
    celery_dispatch_failed = False

    if use_celery:
        logger.info(f"Attempting to use Celery for scraping {len(links_to_scrape)} links for query '{query_context}'.")
        try:
            task_signatures = []
            session_id = request.session.session_key
            for link, idx in links_to_scrape:
                if _actual_scrape_url_task:
                    task_signatures.append(_actual_scrape_url_task.s(link, query_context, idx, session_id))

            if task_signatures and _celery_group:
                job = _celery_group(task_signatures)
                task_group_result_async = job.apply_async()
                active_scrape_task_group_id = task_group_result_async.id
                request.session[f"scrape_task_group_id_{query_context}"] = active_scrape_task_group_id

                for link, idx in links_to_scrape:
                    scraped_items_initial.append({
                        "link": link,
                        "content": "Scraping in progress...",
                        "status": "pending",
                        "index": idx,
                    })
                scraping_pending_initial = True
                logger.info(f"Celery task group {active_scrape_task_group_id} dispatched for {len(links_to_scrape)} links.")
            else:
                logger.warning("No valid Celery task signatures created despite having links to scrape.")
                use_celery = False
        except (_CeleryBrokerError, _CeleryBaseError) as e:
            logger.error(f"Celery dispatch failed for query '{query_context}': {e!r}. Falling back to synchronous scraping.", exc_info=True)
            use_celery = False
            celery_dispatch_failed = True
            active_scrape_task_group_id = None
            if f"scrape_task_group_id_{query_context}" in request.session:
                del request.session[f"scrape_task_group_id_{query_context}"]
            scraped_items_initial = []

    if not use_celery or celery_dispatch_failed:
        if celery_dispatch_failed:
            logger.info(f"Performing synchronous scraping for query '{query_context}' due to Celery dispatch failure.")
        else:
            logger.info(f"Performing synchronous scraping for {len(links_to_scrape)} links for query '{query_context}' (Celery disabled or unavailable).")

        scraped_items_initial = []
        for link, idx in links_to_scrape:
            token_count = 0
            logger.info(f"REQUEST (Sync): Attempting to synchronously scrape URL: {link}")
            try:
                content = scrape_url(link)
                if content:
                    logger.info(f"SUCCESS (Sync): Successfully synchronously scraped URL: {link}. Content length: {len(content)}")
                    try:
                        encoding = tiktoken.encoding_for_model("gpt-4o")
                        token_count = len(encoding.encode(content))
                        logger.info(f"Calculated token count (Sync) for {link}: {token_count}")
                    except Exception as e_tok:
                        logger.error(f"Could not calculate token count (Sync) for {link} (content length {len(content)}): {e_tok!r}", exc_info=True)
                else:
                    logger.warning(f"SUCCESS (Sync, but empty): Scraped URL: {link} but received no content.")

                scraped_items_initial.append({
                    "link": link,
                    "content": content,
                    "status": "success",
                    "index": idx,
                    "token_count": token_count,
                })
            except Exception as e:
                logger.error(f"FAILURE (Sync, Exception): Synchronous scraping for {link} failed: {e!r}", exc_info=True)
                scraped_items_initial.append({
                    "link": link,
                    "content": "",
                    "status": "failed",
                    "error": str(e),
                    "index": idx,
                    "token_count": 0,
                })
        scraping_pending_initial = False

    request.session[f"scraped_results_{query_context}"] = scraped_items_initial
    return scraped_items_initial, active_scrape_task_group_id, scraping_pending_initial


def update_scraped_results_from_celery(
    request: HttpRequest, query_context: str, active_task_group_id: str | None,
) -> tuple[str | None, bool]:
    """
    Check Celery task group status and update session with results

    Args:
        request: HTTP request object containing session data
        query_context: Query string for context and identification
        active_task_group_id: Current Celery task group ID to check

    Returns:
        Tuple containing:
        - Updated task group ID if still pending, else None
        - Boolean indicating if scraping is still in progress
    """
    still_scraping_some = False
    if not (settings.USE_CELERY_FOR_SCRAPING and CELERY_AVAILABLE and active_task_group_id and _celery_GroupResult and _actual_celery_app):
        return active_task_group_id, still_scraping_some

    logger.debug(f"Checking status of Celery task group {active_task_group_id} for query '{query_context}'.")
    try:
        task_group_result = _celery_GroupResult.restore(active_task_group_id, app=_actual_celery_app)
        if not task_group_result:
            logger.warning(f"Could not restore task group {active_task_group_id} for query '{query_context}'.")
            return active_task_group_id, True

        if not task_group_result.ready():
            still_scraping_some = True
            logger.info(f"Task group {active_task_group_id} is still pending. Completed: {task_group_result.completed_count()}/{len(task_group_result)}")
        else:
            logger.info(f"Task group {active_task_group_id} is ready. Fetching results for query '{query_context}'.")
            completed_scraped_items = []
            results_data = task_group_result.get(timeout=1.0)
            for item_result in results_data:
                if isinstance(item_result, dict) and item_result.get("status") == "success":
                    completed_scraped_items.append(item_result)
                else:
                    original_link = item_result.get("link", "Unknown link") if isinstance(item_result, dict) else "Unknown link"
                    error_detail = item_result.get("error", "Unknown error") if isinstance(item_result, dict) else "Unknown error"
                    completed_scraped_items.append({
                        "link": original_link, "content": "", "status": "failed_task",
                        "error": error_detail, "index": item_result.get("index", -1) if isinstance(item_result, dict) else -1,
                    })
            request.session[f"scraped_results_{query_context}"] = completed_scraped_items
            if f"scrape_task_group_id_{query_context}" in request.session:
                del request.session[f"scrape_task_group_id_{query_context}"]
            active_task_group_id = None
            logger.info(f"Updated scraped_results in session from task group {active_task_group_id} for query '{query_context}'.")
            still_scraping_some = False

    except TimeoutError:
        logger.warning(f"Timeout getting task group {active_task_group_id} results for query '{query_context}'. Assuming still pending.")
        still_scraping_some = True
    except (_CeleryBrokerError, _CeleryBaseError) as e:
        logger.error(f"Celery error processing task group {active_task_group_id} for query '{query_context}': {e!r}", exc_info=True)
        still_scraping_some = True
    except Exception as e:
        logger.error(f"Unexpected error processing task group {active_task_group_id} for query '{query_context}' results: {e!r}", exc_info=True)
        still_scraping_some = True

    return active_task_group_id, still_scraping_some
