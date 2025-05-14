from django.apps import AppConfig  # type: ignore


class AgentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "agent"
