FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync

COPY app ./app
COPY .env.production ./.env

RUN mkdir -p /app/data

ENV PYTHONPATH=/app
ENV DATABASE_URL=postgresql://user:password@localhost:5432/panshi

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]