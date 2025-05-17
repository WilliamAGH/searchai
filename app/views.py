"""
View functions for the main application
:author: William Callahan
"""
from django.http import HttpResponse  # type: ignore


def hello_view(request):
    """
    Returns an HTTP response with a greeting message.
    
    This view responds to any HTTP request with a plain text greeting.
    """
    return HttpResponse("Hello, my name is William Callahan!")
