"""
Celery application configuration
:author: William Callahan
"""
import logging
import os
import socket

from celery import Celery, signals
from celery.signals import worker_process_init

logger = logging.getLogger("project.celery")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings")

app = Celery("project")

# Load configuration from Django settings
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in all installed apps
app.autodiscover_tasks()

# Set a reasonable default for task soft time limit if not configured
app.conf.task_soft_time_limit = app.conf.task_soft_time_limit or 300  # 5 minutes

# Set a reasonable default for task hard time limit if not configured
app.conf.task_time_limit = app.conf.task_time_limit or 600  # 10 minutes

# Configure task default queue
app.conf.task_default_queue = "default"

# Configure task default rate limit
app.conf.task_default_rate_limit = "30/m"  # 30 tasks per minute by default

# Configure broker connection retry
app.conf.broker_connection_retry = True
app.conf.broker_connection_retry_on_startup = True
app.conf.broker_connection_max_retries = 10

# Configure result backend settings
app.conf.result_expires = 60 * 60 * 24  # 1 day

# Configure worker settings
app.conf.worker_prefetch_multiplier = 1  # Disable prefetching for long-running tasks
app.conf.worker_max_tasks_per_child = 200  # Restart worker after 200 tasks
app.conf.worker_proc_alive_timeout = 60.0  # 1 minute timeout for worker process

# Configure task acks late for more reliable task execution
app.conf.task_acks_late = True


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """
    Debug task for troubleshooting Celery setup

    @param self: Task instance with request information
    """
    logger.info(f"Debug task executed on {socket.gethostname()}: {self.request!r}")


@signals.worker_ready.connect
def log_worker_ready(**kwargs):
    """
    Log when a worker is ready to receive tasks

    @param kwargs: Signal keyword arguments
    """
    logger.info(f"Celery worker ready: {socket.gethostname()}")


@signals.worker_shutdown.connect
def log_worker_shutdown(**kwargs):
    """
    Log when a worker is shutting down

    @param kwargs: Signal keyword arguments
    """
    logger.info(f"Celery worker shutting down: {socket.gethostname()}")


@worker_process_init.connect
def reset_database_connections(**kwargs):
    """
    Reset database connections when worker processes start
    Prevents sharing connections between worker processes

    @param kwargs: Signal keyword arguments
    """
    from django.db import connections

    for conn in connections.all():
        conn.close()

    logger.info("Database connections reset for worker process")
