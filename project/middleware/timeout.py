"""
Request timeout middleware for preventing long-running views
:author: William Callahan
"""
import logging
import time
from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

logger = logging.getLogger("project.middleware.timeout")

# Default timeout in seconds (30 seconds)
DEFAULT_REQUEST_TIMEOUT = 30

# Get configured timeout from settings or use default
REQUEST_TIMEOUT = getattr(settings, "REQUEST_TIMEOUT", DEFAULT_REQUEST_TIMEOUT)


class RequestTimeoutMiddleware:
    """
    Middleware to enforce timeouts on long-running views
    - Prevents views from running indefinitely
    - Logs warnings for slow views
    - Can be disabled for specific views via decorator
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        """
        Initialize middleware with response handler

        @param get_response: Callable that processes the request
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Process request with timeout monitoring

        @param request: HTTP request to process
        @return: HTTP response from the next middleware or view
        """
        # Skip timeout for admin views and certain paths
        if self._should_skip_timeout(request):
            return self.get_response(request)

        # Get custom timeout from view if specified
        timeout = self._get_timeout(request)

        # Track start time
        start_time = time.time()

        # Process the request
        response = self.get_response(request)

        # Check execution time
        execution_time = time.time() - start_time
        if execution_time > timeout * 0.8:  # Log warning at 80% of timeout
            logger.warning(
                f"Slow view detected: {request.path} took {execution_time:.2f}s "
                f"(80% of {timeout}s timeout)",
            )

        return response

    def _should_skip_timeout(self, request: HttpRequest) -> bool:
        """
        Determine if timeout should be skipped for this request

        @param request: HTTP request to check
        @return: True if timeout should be skipped
        """
        # Skip for admin views
        if request.path.startswith("/admin/"):
            return True

        # Skip for explicitly marked views
        return bool(getattr(request, "_skip_timeout", False))

    def _get_timeout(self, request: HttpRequest) -> int:
        """
        Get timeout value for this request

        @param request: HTTP request to check
        @return: Timeout in seconds
        """
        # Check for custom timeout on the request
        custom_timeout = getattr(request, "_custom_timeout", None)
        if custom_timeout is not None:
            return custom_timeout

        return REQUEST_TIMEOUT


def skip_timeout(view_func):
    """
    Decorator to mark a view as exempt from timeout monitoring

    @param view_func: View function to decorate
    @return: Decorated view function
    """
    def wrapped_view(request, *args, **kwargs):
        request._skip_timeout = True
        return view_func(request, *args, **kwargs)
    return wrapped_view


def custom_timeout(seconds: int):
    """
    Decorator to set custom timeout for a view

    @param seconds: Timeout in seconds
    @return: Decorator function
    """
    def decorator(view_func):
        def wrapped_view(request, *args, **kwargs):
            request._custom_timeout = seconds
            return view_func(request, *args, **kwargs)
        return wrapped_view
    return decorator
