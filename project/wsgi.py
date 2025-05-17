"""
WSGI application configuration
:author: William Callahan

Provides WSGI application entry point for production servers
Exposes the WSGI callable as a module-level variable named 'application'
"""

import os

from django.core.wsgi import get_wsgi_application  # type: ignore

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")

application = get_wsgi_application()
