"""Global exception handling middleware
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
        Initialize middleware with response handler

        @param get_response: Callable that processes the request
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Process request and handle any exceptions

        @param request: HTTP request to process
        @return: HTTP response from the next middleware or view
        """
        try:
            return self.get_response(request)
        except Exception as e:
            return self.handle_exception(request, e)

    def handle_exception(self, request: HttpRequest, exception: Exception) -> HttpResponse:
        """
        Handle uncaught exceptions with appropriate responses

        @param request: HTTP request being processed
        @param exception: Exception that was raised
        @return: HTTP response with error information
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
        Handle permission denied exceptions

        @param request: HTTP request being processed
        @param exception: PermissionDenied exception
        @return: Forbidden response
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
        Log exception with request details

        @param request: HTTP request being processed
        @param exception: Exception that was raised
        @param exc_info: Exception info tuple from sys.exc_info()
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
        Send email notification to admins

        @param request: HTTP request being processed
        @param exception: Exception that was raised
        @param exc_info: Exception info tuple from sys.exc_info()
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
        Render appropriate error response

        @param request: HTTP request being processed
        @param exception: Exception that was raised
        @return: HTTP response with error information
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
