"""
Main application configuration
:author: William Callahan
"""
from django.apps import AppConfig


class CrewaiexperimentalConfig(AppConfig):
    """
    Django application configuration for the main app
    - Configures the default auto field
    - Sets the application name
    """
    default_auto_field = "django.db.models.BigAutoField"
    name = "app"
