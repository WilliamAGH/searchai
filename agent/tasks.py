"""Celery tasks for asynchronous processing
:author: William Callahan
"""
import logging

import tiktoken
from celery import Task, shared_task
from celery.exceptions import MaxRetriesExceededError, Retry

from .services.scraper import scrape_url

logger = logging.getLogger(__name__)


class ScrapeUrlTask(Task):
    """
    Celery task class for URL scraping operations

    - Implements retry mechanism with exponential backoff
    - Provides failure and success handling hooks
    - Configures task acknowledgement behavior
    """
    autoretry_for = (Exception,)
    retry_kwargs = {"max_retries": 3}
    retry_backoff = True
    retry_backoff_max = 60 * 5
    task_acks_late = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """
        Handle task failure with logging

        Args:
            exc: Exception that caused the failure
            task_id: Celery task identifier
            args: Task arguments
            kwargs: Task keyword arguments
            einfo: Exception information
        """
        url_arg = args[0] if args else "Unknown URL"
        logger.error(f"Celery task {task_id} (scrape_url_task) FAILED for URL: {url_arg}. Error: {exc!r}\n{einfo!r}")

    def on_success(self, retval, task_id, args, kwargs):
        """
        Handle task success with logging

        Args:
            retval: Return value from the task
            task_id: Celery task identifier
            args: Task arguments
            kwargs: Task keyword arguments
        """
        url_arg = args[0] if args else "Unknown URL"
        if isinstance(retval, dict) and retval.get("status") == "success":
            logger.info(f"Celery task {task_id} (scrape_url_task) SUCCEEDED for URL: {url_arg}. Content length: {len(retval.get('content',''))}, Tokens: {retval.get('token_count', 'N/A')}")
        else:
            error_detail = retval.get("error", "Unknown error") if isinstance(retval, dict) else "Non-dict retval"
            logger.warning(f"Celery task {task_id} (scrape_url_task) completed for URL: {url_arg}, but scraping operation reported failure or unexpected result: {error_detail}. Retval: {retval!r}")


@shared_task(base=ScrapeUrlTask, name="agent.tasks.scrape_url_task")
def scrape_url_task(url: str, query_context: str, result_index: int, session_id: str | None = None):
    """
    Scrape URL content and process with token counting

    Args:
        url: Web page URL to scrape
        query_context: Query string for identification
        result_index: Position in original search results
        session_id: Optional session identifier for cache updates

    Returns:
        Dictionary with scraping results including:
        - Original URL and metadata
        - Extracted content or error information
        - Token count for LLM processing
        - Operation status
    """
    logger.info(f"REQUEST: Starting scrape_url_task for URL: {url} (Query: {query_context}, Index: {result_index}, Session: {session_id})")
    token_count = 0
    try:
        content = scrape_url(url)

        if content:
            logger.info(f"SUCCESS: Successfully scraped URL: {url}. Content length: {len(content)}")
            try:
                encoding = tiktoken.encoding_for_model("gpt-4o")
                token_count = len(encoding.encode(content))
                logger.info(f"Calculated token count for {url}: {token_count}")
            except Exception as e:
                logger.error(f"Could not calculate token count for {url} (content length {len(content)}): {e!r}", exc_info=True)
        else:
            logger.warning(f"SUCCESS (but empty): Scraped URL: {url} but received no content.")

        return {
            "link": url,
            "content": content,
            "index": result_index,
            "query_context": query_context,
            "session_id": session_id,
            "status": "success",
            "token_count": token_count,
        }
    except Retry:
        logger.warning(f"RETRYING: scrape_url_task for URL: {url} due to Celery retry signal.")
        raise
    except MaxRetriesExceededError:
        logger.error(f"FAILURE (Max Retries): Max retries exceeded for scrape_url_task for URL: {url}.")
        return {
            "link": url,
            "content": "",
            "index": result_index,
            "query_context": query_context,
            "session_id": session_id,
            "status": "failed",
            "error": "Max retries exceeded",
            "token_count": 0,
        }
    except Exception as exc:
        logger.error(f"FAILURE (Exception): Scraping failed in scrape_url_task for URL {url}: {exc!r}", exc_info=True)
        return {
            "link": url,
            "content": "",
            "index": result_index,
            "query_context": query_context,
            "session_id": session_id,
            "status": "failed",
            "error": str(exc),
            "token_count": 0,
        }
