"""
Project module initialization
:author: William Callahan
"""
# Ensures Celery is imported when Django starts
from .celery import app as celery_app

__all__ = ("celery_app",)
