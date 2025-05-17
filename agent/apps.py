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
        Initializes reliability features and resources when the Django application starts.
        
        Ensures the logs directory exists, starts memory monitoring if enabled in settings, and configures HTTP connection pooling and retry logic for outbound requests. Skips initialization when not running the main server process.
        """
        # Skip when running management commands to avoid duplicate initialization
        if os.environ.get("RUN_MAIN") != "true" and "runserver" not in sys.argv:
            return

        # Ensure logs directory exists
        logs_dir = os.path.join(settings.BASE_DIR, "logs")
        if not os.path.exists(logs_dir):
            os.makedirs(logs_dir)
            logger.info(f"Created logs directory at {logs_dir}")

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
                """
                Sends an HTTP request using the provided session, applying a default timeout if none is specified.
                
                Args:
                	method: HTTP method (e.g., 'GET', 'POST').
                	url: The URL to send the request to.
                	*args: Additional positional arguments for the request.
                	**kwargs: Additional keyword arguments for the request. If 'timeout' is not provided, a default timeout is used.
                
                Returns:
                	The response object from the HTTP request.
                """
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
