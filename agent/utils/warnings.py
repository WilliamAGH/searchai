"""
Warning handling utilities for runtime suppression
:author: William Callahan
"""
import os
import warnings


def suppress_pydantic_warnings():
    """
    Suppresses specific Pydantic warnings related to callable types not being Python types.
    
    Configures the warnings filter and environment to ignore UserWarnings from Pydantic's schema generation about callable types, and sets global warning suppression via the PYTHONWARNINGS environment variable.
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
