"""Middleware for handling proxy headers
:author: William Callahan
"""
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse


class ForwardedHeaderMiddleware:
    """
    Trust X-Forwarded-Proto and X-Forwarded-For on every request,
    overriding Django's wsgi.url_scheme and REMOTE_ADDR so that:
      - request.is_secure() is True when X-Forwarded-Proto=https
      - request.META['REMOTE_ADDR'] is the real client IP
    """
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        """
        Initialize middleware with response handler

        Args:
            get_response: Callable that processes the request
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Process request to handle forwarded headers

        Args:
            request: HTTP request to process

        Returns:
            HTTP response from the next middleware or view
        """
        proto = request.META.get("HTTP_X_FORWARDED_PROTO")
        if proto:
            request.META["wsgi.url_scheme"] = proto

        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            # take the first (left-most) entry as the client IP
            request.META["REMOTE_ADDR"] = xff.split(",")[0].strip()

        return self.get_response(request)
