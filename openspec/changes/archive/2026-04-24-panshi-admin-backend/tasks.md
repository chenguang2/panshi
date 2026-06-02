## 1. Project Setup

- [x] 1.1 Initialize backend project with uv (`uv init --name panshi-admin`)
- [x] 1.2 Add backend dependencies (fastapi, uvicorn, sqlalchemy, pydantic, python-jose, passlib, bcrypt, httpx, pytest, pytest-asyncio)
- [x] 1.3 Create backend directory structure (app/api, app/core, app/models, app/schemas, app/services, app/repositories)
- [x] 1.4 Initialize frontend project with Vite (`npm create vite@latest frontend -- --template vue-ts`)
- [x] 1.5 Add frontend dependencies (ant-design-vue, axios, pinia, vue-router)
- [x] 1.6 Install Playwright for frontend E2E testing

## 2. Backend - Database Layer

- [x] 2.1 Create app/core/database.py with SQLAlchemy async engine setup
- [x] 2.2 Implement DATABASE_URL env var handling for SQLite/PostgreSQL
- [x] 2.3 Create Base model class with DeclarativeBase
- [x] 2.4 Create data directory for SQLite storage

## 3. Backend - User Auth Module

- [x] 3.1 Create User model (sys_user table)
- [x] 3.2 Create UserCluster assignment model (sys_user_cluster table)
- [x] 3.3 Create JWT authentication utilities (app/core/security.py)
- [x] 3.4 Implement password hashing with bcrypt
- [x] 3.5 Create auth schemas (LoginRequest, LoginResponse, ChangePasswordRequest)
- [x] 3.6 Implement POST /api/v1/auth/login endpoint
- [x] 3.7 Implement POST /api/v1/auth/logout endpoint
- [x] 3.8 Implement GET /api/v1/auth/me endpoint
- [x] 3.9 Implement PUT /api/v1/auth/password endpoint
- [x] 3.10 Create seed data with default admin user (admin/panshi123)

## 4. Backend - User Management Module

- [x] 4.1 Create user CRUD schemas
- [x] 4.2 Implement GET /api/v1/admin/users endpoint (paginated list)
- [x] 4.3 Implement POST /api/v1/admin/users endpoint
- [x] 4.4 Implement GET /api/v1/admin/users/{id} endpoint
- [x] 4.5 Implement PUT /api/v1/admin/users/{id} endpoint
- [x] 4.6 Implement DELETE /api/v1/admin/users/{id} endpoint
- [x] 4.7 Implement PUT /api/v1/admin/users/{id}/password endpoint
- [x] 4.8 Implement GET /api/v1/admin/users/{id}/clusters endpoint
- [x] 4.9 Implement PUT /api/v1/admin/users/{id}/clusters endpoint

## 5. Backend - Cluster Management Module

- [x] 5.1 Create Cluster model (ps_cluster table)
- [x] 5.2 Create cluster CRUD schemas
- [x] 5.3 Implement cluster CRUD endpoints
- [x] 5.4 Create PANSHI client (app/core/PANSHI_client.py)
- [x] 5.5 Implement POST /api/v1/clusters/{id}/test endpoint
- [x] 5.6 Implement POST /api/v1/clusters/{id}/sync endpoint

## 6. Backend - Upstream Management Module

- [x] 6.1 Create Upstream model (ps_upstream table)
- [x] 6.2 Create UpstreamTarget model (ps_upstream_target table)
- [x] 6.3 Create upstream CRUD schemas
- [x] 6.4 Implement upstream CRUD endpoints under /clusters/{cluster_id}/upstreams
- [x] 6.5 Add upstream reference check when deleting upstreams

## 7. Backend - Route Management Module

- [x] 7.1 Create Route model (ps_route table)
- [x] 7.2 Create route CRUD schemas
- [x] 7.3 Implement route CRUD endpoints under /clusters/{cluster_id}/routes
- [x] 7.4 Implement POST /clusters/{id}/routes/{id}/publish endpoint
- [x] 7.5 Implement POST /clusters/{id}/routes/publish endpoint

## 8. Backend - Plugin Configuration Module

- [x] 8.1 Create RoutePlugin model (ps_route_plugin table)
- [x] 8.2 Define built-in plugin registry with schemas
- [x] 8.3 Implement GET /api/v1/plugins/builtin endpoint
- [x] 8.4 Implement GET /clusters/{cluster_id}/routes/{route_id}/plugins endpoint
- [x] 8.5 Implement PUT /clusters/{cluster_id}/routes/{route_id}/plugins endpoint

## 9. Backend - Config History Module

- [x] 9.1 Create AuditLog model (sys_audit_log table)
- [x] 9.2 Create audit logging service
- [x] 9.3 Integrate audit logging into all CRUD operations
- [x] 9.4 Implement GET /clusters/{cluster_id}/routes/{id}/history endpoint
- [x] 9.5 Implement POST /clusters/{cluster_id}/routes/{id}/rollback endpoint

## 10. Backend - Dictionary Management Module

- [x] 10.1 Create SysDictType model (sys_dict_type table)
- [x] 10.2 Create SysDictData model (sys_dict_data table)
- [x] 10.3 Implement dictionary type CRUD endpoints
- [x] 10.4 Implement dictionary data CRUD endpoints
- [x] 10.5 Implement GET /api/v1/dict/datas/{code} endpoint
- [x] 10.6 Create seed data with standard dictionary types

## 11. Backend - API Layer

- [x] 11.1 Create app/api/v1/ directory structure
- [x] 11.2 Create API router aggregation (app/api/v1/__init__.py)
- [x] 11.3 Add CORS middleware configuration
- [x] 11.4 Add global exception handler
- [x] 11.5 Create dependency injection for get_db and get_current_user

## 12. Backend - Testing

- [x] 12.1 Configure pytest with pytest-asyncio
- [x] 12.2 Create conftest.py with test database fixture
- [x] 12.3 Write unit tests for auth module
- [x] 12.4 Write unit tests for user CRUD
- [x] 12.5 Write unit tests for cluster CRUD
- [x] 12.6 Write unit tests for upstream CRUD
- [x] 12.7 Write unit tests for route CRUD

## 21. Frontend - Plugin Configuration

- [x] 21.1 Create PluginPanel component
- [x] 21.2 Implement mode toggle (form/JSON)
- [x] 21.3 Create JSON editor with syntax highlighting
- [x] 21.4 Create form fields from plugin schema
- [x] 21.5 Sync form ↔ JSON bidirectional

## 22. Frontend - Dictionary Management Pages

- [x] 22.1 Create DictTypeList page
- [x] 22.2 Create DictDataList page (by type)
- [x] 22.3 Create DictForm modals
- [x] 22.4 Connect to dictionary APIs

## 23. Frontend - E2E Tests

- [x] 23.1 Configure Playwright
- [x] 23.2 Write login E2E test
- [x] 23.3 Write cluster CRUD E2E test
- [x] 23.4 Write upstream CRUD E2E test
- [x] 23.5 Write route CRUD E2E test

## 24. Deployment

- [x] 24.1 Create .env.development template
- [x] 24.2 Create .env.production template
- [x] 24.3 Create Dockerfile for backend
- [x] 24.4 Create Dockerfile for frontend
- [x] 24.5 Create docker-compose.yml for full stack
- [x] 24.6 Create systemd service files for CentOS

## 25. Documentation

- [x] 25.1 Create README.md with setup instructions
- [x] 25.2 Create API documentation
- [x] 25.3 Create deployment guide
- [x] 25.4 Create user guide
