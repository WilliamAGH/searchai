"""
Global exception handling middleware
:author: William Callahan
"""
import logging
import sys
import traceback
from collections.abc import Callable

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.core.mail import mail_admins
from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponseForbidden,
    HttpResponseServerError,
)
from django.template.loader import render_to_string

logger = logging.getLogger("project.middleware.exception_handler")


class GlobalExceptionMiddleware:
    """
    Middleware for handling uncaught exceptions globally
    - Logs detailed exception information
    - Sends email notifications to admins
    - Returns appropriate error responses
    - Prevents server crashes from unhandled exceptions
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        """
        Initializes the middleware with the next request-response handler.
        
        Args:
            get_response: The callable that processes each HTTP request.
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Processes an incoming HTTP request and handles uncaught exceptions.
        
        If an exception occurs during request processing, delegates handling to the middleware's exception handler and returns an appropriate HTTP response.
        """
        try:
            return self.get_response(request)
        except Exception as e:
            return self.handle_exception(request, e)

    def handle_exception(self, request: HttpRequest, exception: Exception) -> HttpResponse:
        """
        Handles uncaught exceptions during request processing and returns an appropriate HTTP response.
        
        If the exception is a PermissionDenied, returns a 403 Forbidden response. For other exceptions, logs the error, notifies admins in production, and returns a 500 Server Error response. In debug mode, re-raises the exception to allow Django's debug page to display it.
        """
        # Get exception info
        exc_info = sys.exc_info()

        # Handle specific exception types
        if isinstance(exception, PermissionDenied):
            return self._handle_permission_denied(request, exception)

        # Log the exception with details
        self._log_exception(request, exception, exc_info)

        # Notify admins if in production
        if not settings.DEBUG:
            self._notify_admins(request, exception, exc_info)

        # Return appropriate response
        if settings.DEBUG:
            # Let Django's debug page handle it in debug mode
            raise exception
        else:
            # Custom error page in production
            return self._render_error_response(request, exception)

    def _handle_permission_denied(self, request: HttpRequest, exception: Exception) -> HttpResponse:
        """
        Handles PermissionDenied exceptions by logging the incident and returning a 403 Forbidden response.
        
        Logs a warning with user and request path details, then renders the "403.html" template with the exception message.
        """
        logger.warning(
            f"Permission denied: {str(exception)} "
            f"(User: {request.user}, Path: {request.path})",
        )

        return HttpResponseForbidden(
            render_to_string("403.html", {"exception": str(exception)}, request=request),
        )

    def _log_exception(self, request: HttpRequest, exception: Exception, exc_info) -> None:
        """
        Logs uncaught exceptions with detailed request and traceback information.
        
        Includes the exception type, message, HTTP method, request path, user, and full traceback in the log entry.
        """
        # Format traceback
        tb = "".join(traceback.format_exception(*exc_info))

        # Log with request details
        logger.error(
            f"Uncaught exception: {exception.__class__.__name__}: {str(exception)}\n"
            f"Request: {request.method} {request.path}\n"
            f"User: {request.user}\n"
            f"Traceback:\n{tb}",
        )

    def _notify_admins(self, request: HttpRequest, exception: Exception, exc_info) -> None:
        """
        Sends an email notification to site admins with details of an unhandled exception.
        
        Includes request information, user, exception type, message, and full traceback in the email body. Logs an error if email notification fails.
        """
        try:
            subject = f"Server Error: {request.path}"

            # Format traceback
            tb = "".join(traceback.format_exception(*exc_info))

            # Prepare message
            message = (
                f"Request: {request.method} {request.path}\n"
                f"User: {request.user}\n"
                f"Exception: {exception.__class__.__name__}: {str(exception)}\n"
                f"Traceback:\n{tb}"
            )

            # Send email
            mail_admins(subject, message, fail_silently=True)
        except Exception as e:
            logger.error(f"Failed to send admin notification: {e}", exc_info=True)

    def _render_error_response(self, request: HttpRequest, exception: Exception) -> HttpResponse:
        """
        Returns an HTTP 500 error response rendered with the "500.html" template.
        
        If template rendering fails, returns a simple HTML error message as a fallback.
        """
        # Generic server error response
        try:
            return HttpResponseServerError(
                render_to_string("500.html", {"exception": str(exception)}, request=request),
            )
        except Exception:
            # Fallback if template rendering fails
            return HttpResponseServerError(
                "<h1>Server Error</h1><p>An unexpected error occurred.</p>",
                content_type="text/html",
            )
