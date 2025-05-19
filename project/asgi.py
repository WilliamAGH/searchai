"""
ASGI application configuration
:author: William Callahan

Provides ASGI application entry point for production servers
Exposes the ASGI callable as a module-level variable named 'application'
"""

import os

from django.core.asgi import get_asgi_application  # type: ignore

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")

application = get_asgi_application()
