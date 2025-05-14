"""
Module for suppressing warnings at the earliest possible point.
This must be imported before ANY other imports in your application.
"""
import os
import sys
import warnings

# Completely disable all warnings
if not sys.warnoptions:
    os.environ["PYTHONWARNINGS"] = "ignore"
    warnings.simplefilter("ignore")
    warnings.filterwarnings("ignore")

# Specific Pydantic warning suppression
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic.*")
warnings.filterwarnings(
    "ignore",
    message=r".*callable.*is not a Python type.*",
    category=UserWarning,
)

# Disable Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="pydantic")
