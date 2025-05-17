"""
Celery integration setup for asynchronous task processing
:author: William Callahan
"""
import logging

from django.conf import settings

logger = logging.getLogger("agent.celery_setup")

# Initialize module-level variables for Celery components
_celery_group = None
_celery_GroupResult = None
_CeleryBaseError: type[Exception] = Exception
_CeleryBrokerError: type[Exception] = IOError
_actual_scrape_url_task = None
_actual_celery_app = None
CELERY_AVAILABLE = False

if settings.USE_CELERY_FOR_SCRAPING:
    try:
        from celery import group as imported_group
        try:
            from celery.exceptions import (
                BrokerConnectionError as imported_BrokerError,  # type: ignore[misc]
            )
            _CeleryBrokerError = imported_BrokerError
        except ImportError:
            logger.warning("Could not import celery.exceptions.BrokerConnectionError, using generic IOError for broker errors.")

        from celery.exceptions import CeleryError as imported_CeleryBaseError
        from celery.result import GroupResult as imported_GroupResult

        from project import celery_app as imported_celery_app

        from .tasks import scrape_url_task as imported_scrape_url_task

        _celery_group = imported_group
        _celery_GroupResult = imported_GroupResult
        _CeleryBaseError = imported_CeleryBaseError
        _actual_scrape_url_task = imported_scrape_url_task
        _actual_celery_app = imported_celery_app
        CELERY_AVAILABLE = True
        logger.info("Celery is configured and available for scraping tasks.")
    except ImportError:
        logger.warning("Celery modules could not be imported. USE_CELERY_FOR_SCRAPING is True but Celery might not be installed correctly. Falling back to synchronous scraping.")
        CELERY_AVAILABLE = False
        _CeleryBaseError = Exception
        _CeleryBrokerError = IOError
    except Exception as e:
        logger.error(f"An unexpected error occurred during Celery import/setup: {e!r}. Falling back to synchronous scraping.")
        CELERY_AVAILABLE = False
        _CeleryBaseError = Exception
        _CeleryBrokerError = IOError
else:
    logger.info("Celery is not enabled for scraping tasks (USE_CELERY_FOR_SCRAPING is False).")
    _CeleryBaseError = Exception
    _CeleryBrokerError = IOError
