"""
Root URL configuration for the project
:author: William Callahan

Maps top-level URL patterns to appropriate applications
- Redirects root URL to agent search page
- Includes admin URLs
- Includes application-specific URL configurations
"""
from django.contrib import admin  # type: ignore
from django.urls import include, path  # type: ignore
from django.views.generic import RedirectView  # type: ignore

urlpatterns = [
    path("", RedirectView.as_view(url="/agent/search", permanent=False)),
    path("admin/", admin.site.urls),
    path("agent/", include("agent.urls")),
    path("", include("app.urls")),
]
