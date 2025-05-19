FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# RUN apt-get update && apt-get install -y --no-install-recommends \
#     # e.g., postgresql-client \
#     && rm -rf /var/lib/apt/lists/*

RUN pip install uv

COPY pyproject.toml uv.lock* ./

RUN uv pip install --system --no-cache --upgrade pip setuptools wheel \
    && uv pip install --system --no-cache -r pyproject.toml gunicorn

COPY . .

RUN mkdir -p /app/logs && \
    python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "project.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
