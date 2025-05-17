"""
Session management middleware for controlling session size and cleanup
:author: William Callahan
"""
import json
import logging
from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

logger = logging.getLogger("project.middleware.session_management")

# Default maximum size for session data in bytes (1MB)
DEFAULT_MAX_SESSION_SIZE = 1024 * 1024

# Get configured max session size from settings or use default
MAX_SESSION_SIZE = getattr(settings, "MAX_SESSION_SIZE", DEFAULT_MAX_SESSION_SIZE)


class SessionSizeMiddleware:
    """
    Middleware to monitor and limit Django session size
    - Prevents session data from growing too large
    - Logs warnings when sessions approach size limits
    - Cleans up oldest data when sessions exceed limits
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        """
        Initializes the middleware with the next request handler.
        
        Args:
            get_response: The callable that processes the HTTP request and returns a response.
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Processes the HTTP request and response, checking and managing session size after the response is generated.
        
        If the session was modified during the request, evaluates its size and triggers cleanup if necessary.
        """
        # Process the request first
        response = self.get_response(request)

        # Check session size after view processing
        if hasattr(request, "session") and request.session.modified:
            self._check_session_size(request)

        return response

    def _check_session_size(self, request: HttpRequest) -> None:
        """
        Checks the size of the session data and triggers cleanup if it exceeds configured limits.
        
        Logs a warning if the session size approaches the maximum allowed size. If the session exceeds the maximum size, initiates cleanup of large session entries. Errors during this process are logged.
        """
        try:
            # Estimate session size by serializing to JSON
            session_data = dict(request.session)
            session_size = len(json.dumps(session_data).encode("utf-8"))
            # Log warning if session is getting large
            if session_size > MAX_SESSION_SIZE * 0.8:
                logger.warning(
                    f"Session {request.session.session_key} is approaching size limit: "
                    f"{session_size} bytes (80% of {MAX_SESSION_SIZE})",
                )

            # Clean up if session exceeds max size
            if session_size > MAX_SESSION_SIZE:
                logger.warning(
                    f"Session {request.session.session_key} exceeds size limit: "
                    f"{session_size} bytes. Cleaning up oldest data.",
                )
                self._clean_session(request)
        except Exception as e:
            logger.error(f"Error checking session size: {e}", exc_info=True)

    def _clean_session(self, request: HttpRequest) -> None:
        """
        Removes the oldest search and scraping result data from the session to reduce its size.
        
        Iteratively deletes session keys related to search and scraping results, starting with the oldest, until the session size falls below 70% of the maximum allowed limit.
        """
        # Find search result keys (which tend to be large)
        search_keys = [
            k for k in request.session
            if k.startswith(("search_raw_results_", "search_full_response_", "scraped_results_"))
        ]

        # Sort by assumed age (no timestamp available in standard session)
        # Remove oldest items first until we're under 70% of limit
        for key in search_keys:
            del request.session[key]

            # Check if we're now under the threshold
            remaining_data = dict(request.session)
            remaining_size = len(json.dumps(remaining_data))
            if remaining_size < MAX_SESSION_SIZE * 0.7:
                break
