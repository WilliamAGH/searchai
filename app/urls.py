"""
URL configuration for main application
:author: William Callahan
"""
from django.urls import path  # type: ignore

from . import views

urlpatterns = [
    path("hello/", views.hello_view, name="hello"),
]
