#!/usr/bin/env python3
"""
Quiet version of the SearchAI Web Search CLI that suppresses warnings.
"""
# Import suppression first
from agent.utils.warnings import suppress_pydantic_warnings  # noqa

# Import main CLI app after suppression
from agent.cli import app  # pylint: disable=wrong-import-position

if __name__ == "__main__":
    app()
