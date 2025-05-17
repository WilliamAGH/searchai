"""
Session management middleware for controlling session size and cleanup
:author: William Callahan
"""
import json
import logging
from typing import Callable, Dict, Any

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
        Initialize middleware with response handler
        
        @param get_response: Callable that processes the request
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Process request to manage session size
        
        @param request: HTTP request to process
        @return: HTTP response from the next middleware or view
        """
        # Process the request first
        response = self.get_response(request)

        # Check session size after view processing
        if hasattr(request, "session") and request.session.modified:
            self._check_session_size(request)

        return response

    def _check_session_size(self, request: HttpRequest) -> None:
        """
        Check session size and clean up if necessary
        
        @param request: HTTP request with session data
        """
        try:
            # Estimate session size by serializing to JSON
            session_data = dict(request.session)
            session_size = len(json.dumps(session_data))
            
            # Log warning if session is getting large
            if session_size > MAX_SESSION_SIZE * 0.8:
                logger.warning(
                    f"Session {request.session.session_key} is approaching size limit: "
                    f"{session_size} bytes (80% of {MAX_SESSION_SIZE})"
                )
            
            # Clean up if session exceeds max size
            if session_size > MAX_SESSION_SIZE:
                logger.warning(
                    f"Session {request.session.session_key} exceeds size limit: "
                    f"{session_size} bytes. Cleaning up oldest data."
                )
                self._clean_session(request)
        except Exception as e:
            logger.error(f"Error checking session size: {e}", exc_info=True)

    def _clean_session(self, request: HttpRequest) -> None:
        """
        Clean up session by removing oldest search and scraping data
        
        @param request: HTTP request with session to clean
        """
        # Find search result keys (which tend to be large)
        search_keys = [
            k for k in request.session.keys()
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
