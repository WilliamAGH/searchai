#!/usr/bin/env python
"""
Django command-line utility for administrative tasks
:author: William Callahan
"""
import os
import sys


def main():
    """
    Executes Django administrative commands from the command line.
    
    Sets the default Django settings module if not already defined, imports the Django command execution utility, and runs the management command specified by the command-line arguments. Raises an ImportError if Django is not installed or the environment is not properly configured.
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
