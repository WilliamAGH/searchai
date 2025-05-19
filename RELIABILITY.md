# SearchAI Reliability Improvements

This document outlines the reliability improvements implemented to make the Django application more stable and production-ready.

## Session Management

- Added `SessionSizeMiddleware` to monitor and limit session size
- Implemented automatic cleanup of oldest session data when size limits are exceeded
- Configured maximum session size (default: 1MB)

## Request Timeouts

- Added `RequestTimeoutMiddleware` to prevent long-running views
- Implemented configurable timeout settings (default: 30 seconds)
- Added decorators for custom timeout handling:
  - `@skip_timeout` - Exempt a view from timeout monitoring
  - `@custom_timeout(seconds)` - Set a custom timeout for a specific view

## Memory Management

- Added memory monitoring utilities in `agent.utils.memory`
- Implemented background thread for periodic memory usage logging
- Added memory threshold warnings (default: 80% of available memory)
- Created `@memory_intensive` decorator for tracking resource-intensive functions

## Connection Pooling

- Implemented connection pooling for HTTP requests
- Added retry mechanism with exponential backoff
- Configured consistent timeouts across all external requests
- Added global session management for request reuse

## Celery Configuration

- Enhanced Celery settings for better reliability:
  - Configured worker concurrency based on CPU count
  - Disabled prefetching for long-running tasks
  - Set task acknowledgement to happen after completion
  - Added worker process recycling after 200 tasks
  - Configured broker connection retry settings

## Error Handling

- Added `GlobalExceptionMiddleware` for comprehensive exception handling
- Implemented detailed error logging with context information
- Added email notifications for production errors
- Ensured proper error responses for different exception types

## Logging Improvements

- Configured rotating file logs with size limits
- Added structured logging with timestamps and log levels
- Set up different log handlers for various components
- Implemented log filtering based on environment

## Configuration

All reliability features can be configured through environment variables or Django settings:

```python
# Session management
MAX_SESSION_SIZE = 1024 * 1024  # 1MB default

# Request timeout settings
REQUEST_TIMEOUT = 30  # 30 seconds default

# Connection pooling
REQUESTS_MAX_RETRIES = 3
REQUESTS_TIMEOUT = 10  # 10 seconds default

# Memory monitoring
MEMORY_MONITOR_ENABLED = False  # Set to True to enable
MEMORY_MONITOR_INTERVAL = 300  # 5 minutes default
MEMORY_THRESHOLD = 0.8  # 80% threshold default
```

## Usage

The reliability features are automatically enabled when the Django application starts. No additional configuration is required for basic functionality.

For custom timeout handling, use the provided decorators:

```python
from project.middleware.timeout import skip_timeout, custom_timeout

@skip_timeout
def long_running_view(request):
    # This view will not be subject to timeout monitoring
    ...

@custom_timeout(60)  # 60 seconds
def another_view(request):
    # This view has a custom timeout of 60 seconds
    ...
```

For memory-intensive operations, use the memory_intensive decorator:

```python
from agent.utils.memory import memory_intensive

@memory_intensive
def process_large_data(data):
    # Memory usage will be logged before and after this function
    ...
```
