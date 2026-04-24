# Panshi Admin API Documentation

## Base URL
```
http://localhost:8000/api/v1
```

## Authentication

All endpoints except `/auth/login` require JWT Bearer token in Authorization header:
```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST /auth/login
Login with username and password.

**Request:**
```json
{
  "username": "admin",
  "password": "panshi123"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "status": 1
  }
}
```

#### POST /auth/logout
Logout current user.

#### GET /auth/me
Get current user info.

#### PUT /auth/password
Change own password.

**Request:**
```json
{
  "old_password": "oldpass",
  "new_password": "newpass"
}
```

### User Management

#### GET /admin/users
List all users with pagination.

**Query Parameters:**
- `keyword`: Filter by username
- `role`: Filter by role
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 20)

#### POST /admin/users
Create new user.

#### GET /admin/users/{id}
Get user by ID.

#### PUT /admin/users/{id}
Update user.

#### DELETE /admin/users/{id}
Delete user.

#### PUT /admin/users/{id}/password
Reset user password (admin only).

#### GET /admin/users/{id}/clusters
Get user's cluster assignments.

#### PUT /admin/users/{id}/clusters
Assign clusters to user.

### Cluster Management

#### GET /clusters
List all clusters.

#### POST /clusters
Create new cluster.

#### GET /clusters/{id}
Get cluster by ID.

#### PUT /clusters/{id}
Update cluster.

#### DELETE /clusters/{id}
Delete cluster.

#### POST /clusters/{id}/test
Test cluster connection.

#### POST /clusters/{id}/sync
Sync cluster configuration.

### Upstream Management

#### GET /clusters/{cluster_id}/upstreams
List upstreams for a cluster.

#### POST /clusters/{cluster_id}/upstreams
Create new upstream.

#### GET /clusters/{cluster_id}/upstreams/{id}
Get upstream by ID.

#### PUT /clusters/{cluster_id}/upstreams/{id}
Update upstream.

#### DELETE /clusters/{cluster_id}/upstreams/{id}
Delete upstream.

### Route Management

#### GET /clusters/{cluster_id}/routes
List routes for a cluster.

#### POST /clusters/{cluster_id}/routes
Create new route.

#### GET /clusters/{cluster_id}/routes/{id}
Get route by ID.

#### PUT /clusters/{cluster_id}/routes/{id}
Update route.

#### DELETE /clusters/{cluster_id}/routes/{id}
Delete route.

#### POST /clusters/{cluster_id}/routes/{id}/publish
Publish route to cluster.

#### POST /clusters/{cluster_id}/routes/publish
Publish all routes.

#### GET /clusters/{cluster_id}/routes/{id}/history
Get route change history.

#### POST /clusters/{cluster_id}/routes/{id}/rollback
Rollback route to previous version.

#### GET /clusters/{cluster_id}/routes/{id}/plugins
Get route plugins.

#### PUT /clusters/{cluster_id}/routes/{id}/plugins
Update route plugins.

### Plugin Management

#### GET /plugins/builtin
List all built-in plugins.

### Dictionary Management

#### GET /dict/types
List all dictionary types.

#### POST /dict/types
Create dictionary type.

#### PUT /dict/types/{id}
Update dictionary type.

#### DELETE /dict/types/{id}
Delete dictionary type.

#### GET /dict/types/{type_id}/datas
List dictionary data for a type.

#### POST /dict/datas
Create dictionary data.

#### PUT /dict/datas/{id}
Update dictionary data.

#### DELETE /dict/datas/{id}
Delete dictionary data.

#### GET /dict/datas/{code}
Get dictionary data by code. ## Deployment Guide

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (production)
- Docker & Docker Compose (containerized deployment)

## Development Setup

### Backend

```bash
cd backend
uv sync
mkdir -p data
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

**Backend (.env)**
```
DATABASE_URL=sqlite:///./data/panshi.db
JWT_SECRET_KEY=your-secret-key
JWT_EXPIRE_MINUTES=1440
```

**Frontend**
Configure proxy in `vite.config.ts` to `/api/v1` → `http://localhost:8000`

## Production Deployment

### Docker Compose

```bash
docker-compose up -d
```

Services:
- postgres: PostgreSQL 15 database
- backend: FastAPI application on port 8000
- frontend: Nginx serving Vue app on port 3000

### Manual Deployment

#### Backend (CentOS with systemd)

```bash
# Copy service file
sudo cp deployment/panshi-backend.service /etc/systemd/system/

# Edit database credentials in service file
sudo vi /etc/systemd/system/panshi-backend.service

# Enable and start
sudo systemctl enable panshi-backend
sudo systemctl start panshi-backend
```

#### Frontend (Nginx)

```bash
# Build frontend
cd frontend && npm run build

# Copy to nginx directory
sudo cp -r dist/* /usr/share/nginx/html/

# Copy nginx config
sudo cp nginx.conf /etc/nginx/conf.d/panshi.conf

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

## Database Migration

On first deploy or after schema changes:

```bash
cd backend
uv run python -c "import asyncio; from app.core.database import init_db; asyncio.run(init_db())"
```

## Default Credentials

**Admin User:**
- Username: admin
- Password: panshi123

**Change password in production:**
```bash
export JWT_SECRET_KEY=your-production-secret-key
```