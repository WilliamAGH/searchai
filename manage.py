#!/usr/bin/env python
"""
Django command-line utility for administrative tasks
:author: William Callahan
"""
import os
import sys


def main():
    """
    Run Django administrative tasks
    - Sets up Django environment
    - Handles command line arguments
    - Executes appropriate Django command
    """
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")
    try:
        from django.core.management import execute_from_command_line  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?",
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
