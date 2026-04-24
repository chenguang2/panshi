# Panshi Admin

Multi-cluster gateway management platform for unified configuration management.

## Features

- JWT-based authentication with role-based access control
- Multi-cluster management with connection testing
- Upstream configuration with load balancing support
- Route management with publish workflow
- Plugin configuration with dual-mode editor (form/JSON)
- Configuration history and rollback
- Dictionary management for system enums

## Tech Stack

### Backend
- FastAPI with async SQLAlchemy 2.0
- JWT authentication with bcrypt
- SQLite (development) / PostgreSQL (production)

### Frontend
- Vue 3 with TypeScript and Composition API
- Ant Design Vue component library
- Pinia for state management
- Vue Router for navigation

## Quick Start

### Backend

```bash
cd backend

# Install dependencies
uv sync

# Create data directory
mkdir -p data

# Run server
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

### Access

Open http://localhost:3000 and login with:
- Username: admin
- Password: panshi123

## Docker

```bash
docker-compose up -d
```

## Project Structure

```
panshi-admin/
├── backend/
│   ├── app/
│   │   ├── api/v1/     # API endpoints
│   │   ├── core/        # Database, security
│   │   ├── models/      # SQLAlchemy models
│   │   └── schemas/     # Pydantic schemas
│   ├── tests/           # pytest tests
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/         # Axios API client
│   │   ├── components/   # Vue components
│   │   ├── router/      # Vue Router
│   │   ├── stores/       # Pinia stores
│   │   ├── types/       # TypeScript types
│   │   └── views/       # Page components
│   └── package.json
└── docker-compose.yml
```