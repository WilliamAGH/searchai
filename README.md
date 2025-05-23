# SearchAI Experimental

A modern Django project for experimenting with SearchAI tools, featuring a web search interface and CLI.

## Quick Start Guide

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/williamagh/searchai-experimental.git
cd searchai-experimental

# Install dependencies
uv sync
```

### 2. Configuration

Create a `.env` file in the project root:

```env
DJANGO_SECRET_KEY='your_super_secret_dev_key_here_make_something_up'
DEBUG=True
CELERY_BROKER_URL='redis://localhost:6379/0'
CELERY_RESULT_BACKEND='redis://localhost:6379/0'
# USE_CELERY_FOR_SCRAPING=True # Uncomment to enable Celery for scraping tasks
```

### 3. Development

```bash
# Apply database migrations
uv run python manage.py migrate

# Start development server
uv run python manage.py runserver localhost:8000

# Start Celery worker (for asynchronous tasks like scraping)
# Ensure your CELERY_BROKER_URL (e.g., Redis) is running and accessible.
uv run celery -A project worker --loglevel=info
# If you use Celery Beat for scheduled tasks, start it with:
# uv run celery -A project beat --loglevel=info

# Visit http://127.0.0.1:8000/agent/search/ in your browser
```

## Common Commands

### Development

```bash
# Run development server
uv run python manage.py runserver localhost:8000

# Create admin user (if needed)
uv run python manage.py createsuperuser

# Apply database migrations
uv run python manage.py migrate

# Create new migrations
uv run python manage.py makemigrations

# Django shell
uv run python manage.py shell
```

### CLI Usage

```bash
# Search from command line
uv run crew-search "your search query"
```

### Production

```bash
# Start production server
uv run gunicorn project.wsgi:application --bind 0.0.0.0:8000

# For Celery in production, you need to run Celery workers and optionally Celery Beat
# as background services. This is typically managed with tools like:
# - systemd: For creating and managing service files.
# - Supervisor: Another process control system
# - Docker Compose: to containerizw the application
# Example (conceptual, adapt to your deployment tool):
# uv run celery -A project worker --loglevel=INFO --concurrency=4 (daemonized)
# uv run celery -A project beat --loglevel=INFO (daemonized)
```

### Testing

```bash
# Run tests
uv run python manage.py test
```

### Dependency Management

```bash
# Add a new package
uv add package_name

# Add a development dependency
uv add --dev package_name
```

## Code Quality

### Linting

```bash
# Check code with Ruff
uv run ruff check .

# Auto-fix basic issues
uv run ruff check --fix .

# Auto-fix all issues (including docstring whitespace)
uv run ruff check --unsafe-fixes --fix .
```

### Type Checking

```bash
# Check types with MyPy
uv run mypy .

# Check types with Pyright
uv run pyright .
```

### System Checks

```bash
# Run Django system checks
uv run python manage.py check
```

## Project Structure

```
searchai-experimental/
├── agent/             # CrewAI search agent implementation
│   ├── services/      # API services and utilities
│   └── cli.py         # Command-line interface
├── app/               # Django application
├── project/           # Django project settings
├── templates/         # HTML templates
└── manage.py          # Django management script
```

## Environment Variables

- `DEBUG`: Set to `True` for development (detailed error pages, no HTTPS redirection).
- `DJANGO_SECRET_KEY`: Required for Django security features.
- `CELERY_BROKER_URL`: URL for the Celery message broker (e.g., `redis://localhost:6379/0`). Required if using Celery.
- `CELERY_RESULT_BACKEND`: URL for the Celery result backend (e.g., `redis://localhost:6379/0`). Required if using Celery and want to store task results.
- `USE_CELERY_FOR_SCRAPING`: Set to `True` to enable Celery for background scraping tasks. Defaults to `False`.

## Learn More

For more information about using uv with Django projects, check out:
[Kickstarting a Modern Django Project Using uv in 2025](https://williamcallahan.com/blog/kickstarting-a-modern-django-project-using-uv-in-2025)
