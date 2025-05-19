"""
Warning handling utilities for runtime suppression
:author: William Callahan
"""
import os
import warnings


def suppress_pydantic_warnings():
    """
    Specifically suppress Pydantic warnings about callable types.
    This targets the exact warning message we're seeing.
    """
    warnings.filterwarnings(
        "ignore",
        message=r".*callable.*is not a Python type.*",
        category=UserWarning,
        module="pydantic._internal._generate_schema",
    )
    os.environ["PYTHONWARNINGS"] = "ignore"

# Apply suppression when module is imported
suppress_pydantic_warnings()
