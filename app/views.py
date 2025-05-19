
"""View functions for the main application
:author: William Callahan
"""
from django.http import HttpResponse  # type: ignore


def hello_view(request):
    """
    Simple hello world view

    Args:
        request: HTTP request object

    Returns:
        HTTP response with greeting message
    """
    return HttpResponse("Hello, my name is William Callahan!")
