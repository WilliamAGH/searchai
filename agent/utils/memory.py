"""
Memory monitoring utilities for tracking resource usage
:author: William Callahan
"""
import gc
import logging
import os
import resource
import sys
import threading
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("agent.utils.memory")

# Memory threshold for warnings (default: 80% of available memory)
DEFAULT_MEMORY_THRESHOLD = 0.8


def get_memory_usage() -> dict[str, Any]:
    """
    Get current memory usage statistics
    
    @return: Dictionary with memory usage information
    """
    usage = {}

    # Get process memory info
    try:
        usage["rss"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # Convert to bytes (macOS reports in bytes, Linux in KB)
        if sys.platform != "darwin":
            usage["rss"] *= 1024
    except Exception as e:
        logger.error(f"Error getting resource usage: {e}", exc_info=True)
        usage["rss"] = 0

    # Get Python-specific memory info
    try:
        import psutil
        process = psutil.Process(os.getpid())
        mem_info = process.memory_info()
        usage["vms"] = mem_info.vms  # Virtual Memory Size
        usage["rss_psutil"] = mem_info.rss  # Resident Set Size
        usage["percent"] = process.memory_percent()
        usage["available"] = psutil.virtual_memory().available
        usage["total"] = psutil.virtual_memory().total
    except ImportError:
        logger.warning("psutil not installed, some memory metrics unavailable")
    except Exception as e:
        logger.error(f"Error getting psutil memory info: {e}", exc_info=True)

    return usage


def log_memory_usage(threshold: float = DEFAULT_MEMORY_THRESHOLD) -> None:
    """
    Log current memory usage and warn if above threshold
    
    @param threshold: Memory usage threshold for warnings (0.0-1.0)
    """
    usage = get_memory_usage()

    # Basic logging of RSS
    rss_mb = usage.get("rss", 0) / (1024 * 1024)
    logger.info(f"Current memory usage: {rss_mb:.2f} MB RSS")

    # More detailed logging if psutil is available
    if "percent" in usage and "available" in usage and "total" in usage:
        percent = usage["percent"]
        available_mb = usage["available"] / (1024 * 1024)
        total_mb = usage["total"] / (1024 * 1024)

        logger.info(
            f"Memory details: {percent:.1f}% of system memory used by this process, "
            f"{available_mb:.2f} MB available out of {total_mb:.2f} MB total",
        )

        # Warning if memory usage is high
        if percent > threshold * 100:
            logger.warning(
                f"High memory usage detected: {percent:.1f}% (threshold: {threshold*100:.1f}%)",
            )

            # Suggest garbage collection
            logger.info("Triggering garbage collection")
            collected = gc.collect()
            logger.info(f"Garbage collection completed: {collected} objects collected")


class MemoryMonitorThread(threading.Thread):
    """
    Background thread for periodic memory monitoring
    - Runs in daemon mode to avoid blocking application shutdown
    - Logs memory usage at configurable intervals
    - Can be stopped gracefully
    """

    def __init__(self, interval: int = 300, threshold: float = DEFAULT_MEMORY_THRESHOLD):
        """
        Initialize memory monitor thread
        
        @param interval: Monitoring interval in seconds
        @param threshold: Memory usage threshold for warnings (0.0-1.0)
        """
        super().__init__(daemon=True)
        self.interval = interval
        self.threshold = threshold
        self._stop_event = threading.Event()

    def stop(self) -> None:
        """
        Signal the thread to stop
        """
        self._stop_event.set()

    def run(self) -> None:
        """
        Run the monitoring loop
        """
        logger.info(f"Memory monitor started (interval: {self.interval}s, threshold: {self.threshold*100:.1f}%)")

        while not self._stop_event.is_set():
            try:
                log_memory_usage(self.threshold)
            except Exception as e:
                logger.error(f"Error in memory monitor: {e}", exc_info=True)

            # Sleep for the interval or until stopped
            self._stop_event.wait(self.interval)

        logger.info("Memory monitor stopped")


# Global monitor instance
_monitor: MemoryMonitorThread | None = None


def start_memory_monitor(interval: int = 300, threshold: float = DEFAULT_MEMORY_THRESHOLD) -> None:
    """
    Start the memory monitoring thread
    
    @param interval: Monitoring interval in seconds
    @param threshold: Memory usage threshold for warnings (0.0-1.0)
    """
    global _monitor

    if _monitor is not None:
        logger.warning("Memory monitor already running")
        return

    _monitor = MemoryMonitorThread(interval, threshold)
    _monitor.start()


def stop_memory_monitor() -> None:
    """
    Stop the memory monitoring thread
    """
    global _monitor

    if _monitor is None:
        logger.warning("No memory monitor running")
        return

    _monitor.stop()
    _monitor = None


def memory_intensive(func: Callable) -> Callable:
    """
    Decorator for memory-intensive functions
    - Logs memory usage before and after function execution
    - Forces garbage collection after execution
    
    @param func: Function to decorate
    @return: Decorated function
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        func_name = func.__name__
        logger.info(f"Starting memory-intensive function: {func_name}")

        # Log memory before
        log_memory_usage()

        # Call the function
        result = func(*args, **kwargs)

        # Force garbage collection
        collected = gc.collect()

        # Log memory after
        logger.info(f"Completed memory-intensive function: {func_name}, collected {collected} objects")
        log_memory_usage()

        return result

    return wrapper
