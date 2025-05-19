"""
Warning suppression utilities
:author: William Callahan

Suppresses warnings at the earliest possible point
Must be imported before ANY other imports in your application
Prevents unnecessary warnings from dependencies like Pydantic and libraries
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
