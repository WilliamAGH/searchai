"""
Middleware for handling proxy headers
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
        Initializes the middleware with the next response handler.
        
        Args:
            get_response: The callable to process each HTTP request.
        """
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Processes the request to update protocol and client IP based on forwarded headers.
        
        If present, sets the request's URL scheme and remote address using the values from
        the 'X-Forwarded-Proto' and 'X-Forwarded-For' headers before passing the request
        to the next middleware or view.
        
        Args:
            request: The incoming HTTP request.
        
        Returns:
            The HTTP response from the next middleware or view.
        """
        proto = request.META.get("HTTP_X_FORWARDED_PROTO")
        if proto:
            request.META["wsgi.url_scheme"] = proto

        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            # take the first (left-most) entry as the client IP
            request.META["REMOTE_ADDR"] = xff.split(",")[0].strip()

        return self.get_response(request)
