# SearchAI Experimental

A modern Django project for experimenting with SearchAI tools, featuring a web search interface and CLI.

## Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver

## Getting Started

### Setup Environment

```bash
# Clone the repository
git clone https://github.com/williamagh/searchai-experimental.git
cd searchai-experimental

# Sync environment for package installation
uv sync
```

### Environment Variables for Development

For local development, it's important to ensure `DEBUG` mode is enabled in Django. This project is configured to use environment variables for settings like `DEBUG` and `DJANGO_SECRET_KEY`. These are loaded from a `.env` file in the project root.

Create a `.env` file in the root of the `crewai-experimental` directory with the following content:

```env
DJANGO_SECRET_KEY='your_super_secret_dev_key_here_make_something_up'
DEBUG=True
```

Setting `DEBUG=True` will:
- Enable Django's debug pages with detailed error information.
- Prevent redirection to HTTPS by the development server.
- Disable certain production security settings for ease of development.

Make sure this `.env` file is included in your `.gitignore` and not committed to your repository, especially if it contains sensitive information.

### Run Development Server

```bash
# Apply migrations as needed
uv run python manage.py migrate

# Create a superuser (optional) for Django admin access
uv run python manage.py createsuperuser

# Start development server
# This will use settings from your .env file if present (e.g., DEBUG=True)
uv run python manage.py runserver

# Alternatively, you can set DEBUG directly in the command:
# DEBUG=True uv run python manage.py runserver

# Open http://127.0.0.1:8000/ in your browser to access the Django admin interface
# Or visit http://127.0.0.1:8000/agent/search/ to access the SearchAI search web UI
```

### Production Server

```bash
# Apply migrations as needed
uv run python manage.py migrate

# Start production server
uv run gunicorn project.wsgi:application --bind 0.0.0.0:8000
```

## Using the Search CLI

This project includes a CLI tool for web searches using CrewAI:

```bash
# Basic search
uv run crew-search "your search query"
```

The CLI provides nicely formatted search results using Rich's console features.

## Running Project Commands

Use `uv run` to execute Python scripts and Django management commands:

```bash
# Run Django management commands
uv run python manage.py makemigrations
uv run python manage.py migrate
uv run python manage.py shell

# Run tests
uv run python manage.py test

# Run with specific settings
uv run python manage.py runserver --settings=project.settings
```

## Adding Dependencies

```bash
# Add a new package
uv add package_name

# Add a development dependency
uv add --dev package_name
```

## Linting and Type Checking

This project uses several tools for code quality and type checking:

```bash
# Run Ruff linter
uv run ruff check .

# Auto-fix Ruff linting issues
uv run ruff check --fix .

# Run Mypy type checker
uv run mypy .

# Run Pyright type checker
uv run pyright .

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

## Learn More

For more information about using uv with Django projects, check out:
[Kickstarting a Modern Django Project Using uv in 2025](https://williamcallahan.com/blog/kickstarting-a-modern-django-project-using-uv-in-2025)
