"""
Agent application configuration
:author: William Callahan
"""
import logging
import os
import sys

from django.apps import AppConfig  # type: ignore
from django.conf import settings

logger = logging.getLogger("agent.apps")


class AgentConfig(AppConfig):
    """
    Django application configuration for the agent app
    - Configures the default auto field
    - Sets the application name
    - Initializes reliability features on startup
    """
    default_auto_field = "django.db.models.BigAutoField"
    name = "agent"

    def ready(self):
        """
        Initialize application components when Django starts
        - Sets up memory monitoring if enabled
        - Configures request connection pooling
        - Ensures log directory exists
        """
        # Skip when running management commands to avoid duplicate initialization
        # Also, ensure that production processes (like Gunicorn/Celery workers)
        # which don't set RUN_MAIN or include 'runserver' in sys.argv,
        # still get full initialization if not in DEBUG mode
        if settings.DEBUG and os.environ.get("RUN_MAIN") != "true" and "runserver" not in sys.argv:
            logger.info("Skipping full app initialization for auxiliary Django process in DEBUG mode.")
            return

        # Ensure logs directory exists (race-safe)
        logs_dir = os.path.join(settings.BASE_DIR, "logs")
        os.makedirs(logs_dir, exist_ok=True)
        # Optionally, log if it was newly created, though exist_ok=True means it won't error if it exists
        # To log creation specifically, you might need a slightly different approach or accept not logging it
        # For simplicity and idempotency, just ensuring it exists is often enough
        # If logging creation is critical:
        # if not os.path.exists(logs_dir): # Check before for logging, then create with exist_ok=True
        #     os.makedirs(logs_dir, exist_ok=True)
        #     logger.info(f"Created logs directory at {logs_dir}")
        # else:
        #     os.makedirs(logs_dir, exist_ok=True) # Ensures it's there even if check was momentarily false
        # For now, keeping it simple as per the direct suggestion:
        logger.debug(f"Ensured logs directory exists at {logs_dir}")

        # Start memory monitoring if enabled
        if getattr(settings, "MEMORY_MONITOR_ENABLED", False):
            try:
                from .utils.memory import start_memory_monitor
                interval = getattr(settings, "MEMORY_MONITOR_INTERVAL", 300)
                threshold = getattr(settings, "MEMORY_THRESHOLD", 0.8)
                start_memory_monitor(interval=interval, threshold=threshold)
                logger.info(f"Memory monitoring started (interval: {interval}s, threshold: {threshold*100:.1f}%)")
            except ImportError:
                logger.warning("Could not import memory monitoring utilities. Memory monitoring disabled.")
            except Exception as e:
                logger.error(f"Failed to start memory monitoring: {e}", exc_info=True)

        # Configure requests library connection pooling
        try:
            import requests
            from requests.adapters import HTTPAdapter
            from urllib3.util.retry import Retry

            # Get settings
            max_retries = getattr(settings, "REQUESTS_MAX_RETRIES", 3)
            timeout = getattr(settings, "REQUESTS_TIMEOUT", 10)

            # Configure retry strategy
            retry_strategy = Retry(
                total=max_retries,
                backoff_factor=0.5,
                status_forcelist=[429, 500, 502, 503, 504],
            )

            # Create and mount adapters for both HTTP and HTTPS
            adapter = HTTPAdapter(max_retries=retry_strategy)
            session = requests.Session()
            session.mount("http://", adapter)
            session.mount("https://", adapter)

            # Set default timeout
            def request_with_timeout(method, url, *args, **kwargs):
                kwargs_with_timeout = kwargs.copy()
                if "timeout" not in kwargs_with_timeout:
                    kwargs_with_timeout["timeout"] = timeout
                # Call the original Session.request to include our timeout by default
                return requests.Session.request(session, method, url, *args, **kwargs_with_timeout)

            session.request = request_with_timeout

            # Store session for reuse
            from .services.search import configure_requests_session
            configure_requests_session(session)

            logger.info(f"Configured requests connection pooling (max_retries={max_retries}, timeout={timeout}s)")
        except ImportError:
            logger.warning("Could not import requests library. Connection pooling not configured.")
        except Exception as e:
            logger.error(f"Failed to configure requests connection pooling: {e}", exc_info=True)

        logger.info("Agent application initialized with reliability features")
