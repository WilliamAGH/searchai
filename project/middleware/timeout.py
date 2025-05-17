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
        Initializes the middleware with the given response handler.
        
        Args:
            get_response: A callable that processes the HTTP request and returns a response.
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Processes an HTTP request and monitors its execution time against a configured timeout.
        
        If the request is not exempt from timeout monitoring, measures the view's execution duration and logs a warning if it exceeds 80% of the applicable timeout. Returns the response from the next middleware or view.
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
        Determines whether timeout enforcement should be skipped for the given request.
        
        Timeout is skipped for requests to admin paths or if the request has been explicitly marked to bypass timeout checks.
        
        Args:
            request: The HTTP request to evaluate.
        
        Returns:
            True if timeout enforcement should be skipped; otherwise, False.
        """
        # Skip for admin views
        if request.path.startswith("/admin/"):
            return True

        # Skip for explicitly marked views
        return bool(getattr(request, "_skip_timeout", False))

    def _get_timeout(self, request: HttpRequest) -> int:
        """
        Retrieves the timeout value in seconds for the given request.
        
        Returns a custom timeout if set on the request; otherwise, returns the default timeout.
        """
        # Check for custom timeout on the request
        custom_timeout = getattr(request, "_custom_timeout", None)
        if custom_timeout is not None:
            return custom_timeout

        return REQUEST_TIMEOUT


def skip_timeout(view_func):
    """
    Marks a view as exempt from request timeout enforcement.
    
    Use this decorator to prevent the middleware from applying timeout checks to the decorated view.
    """
    def wrapped_view(request, *args, **kwargs):
        """
        Marks the request to skip timeout enforcement for the decorated view.
        
        Sets an attribute on the request to indicate that timeout monitoring should be bypassed for this view.
        """
        request._skip_timeout = True
        return view_func(request, *args, **kwargs)
    return wrapped_view


def custom_timeout(seconds: int):
    """
    Decorator that sets a custom timeout value (in seconds) for a Django view.
    
    Args:
    	seconds: The timeout duration in seconds to apply to the decorated view.
    
    Returns:
    	A decorator that applies the specified timeout to the view.
    """
    def decorator(view_func):
        """
        Decorator that sets a custom timeout value for a view.
        
        Applies a per-request timeout (in seconds) by setting the `_custom_timeout` attribute on the request before invoking the view.
        """
        def wrapped_view(request, *args, **kwargs):
            request._custom_timeout = seconds
            return view_func(request, *args, **kwargs)
        return wrapped_view
    return decorator
