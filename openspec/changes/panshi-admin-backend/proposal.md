## Why

Panshi is a multi-cluster gateway management platform that provides unified configuration management for multiple gateway clusters. Configuration is stored locally in a database and synchronized to gateway clusters via Admin API when users publish changes. This enables centralized management, version control, and rollback capabilities for gateway routing configurations.

## What Changes

- **User Management**: JWT-based authentication, role-based access control (admin/user), password management
- **Multi-Cluster Management**: Support for managing multiple gateway clusters with user-cluster assignment
- **Upstream Management**: Configure target nodes per cluster with load balancing strategies
- **Route Management**: Configure routes with URI patterns, HTTP methods, upstream binding, and plugins
- **Plugin Configuration**: Built-in plugin parameter management with dual-mode editor (form + JSON)
- **Config History & Rollback**: Full audit trail of all configuration changes with version rollback support
- **Dictionary Management**: System-level enum values for HTTP methods, load balance types, plugin names, etc.
- **Config Publishing**: Manual publish workflow to synchronize local config to target clusters

## Capabilities

### New Capabilities

- `user-auth`: JWT-based authentication including login, logout, token refresh, and password change
- `user-mgmt`: User CRUD operations, role assignment, password reset by admin, and user-cluster assignment
- `cluster-mgmt`: Cluster CRUD, connection testing, and full config synchronization to gateway clusters
- `upstream-mgmt`: Upstream CRUD with target node management (host:port:weight) and load balance type selection
- `route-mgmt`: Route CRUD with URI pattern, HTTP methods, upstream binding, priority, and status control
- `plugin-cfg`: Built-in plugin configuration per route with form-based and JSON editor modes
- `config-history`: Audit logging for all configuration changes with diff view and rollback capability
- `dict-mgmt`: Dictionary type and data management for system-level enum values
- `db-abstraction`: SQLAlchemy 2.0 abstraction layer supporting seamless SQLite/PostgreSQL switching

### Modified Capabilities

None - this is a new system with no existing capabilities.

## Impact

### Backend (Python)
- FastAPI REST API with Pydantic schemas for request/response validation
- SQLAlchemy 2.0 ORM with async session support
- JWT authentication with bcrypt password hashing
- httpx async client for gateway Admin API communication
- pytest + pytest-asyncio for unit and integration testing

### Frontend (Vue 3)
- Vue 3 Composition API with TypeScript
- Ant Design Vue component library
- Pinia for state management
- Vue Router for navigation
- Axios for API communication
- Playwright for E2E testing

### Database
- SQLite for development (file-based, zero-config)
- PostgreSQL for production (connection via DATABASE_URL env var)
- SQLAlchemy abstraction ensures seamless DB switching

### Testing
- Backend: pytest with pytest-asyncio, pytest-cov for coverage
- Frontend: Playwright for E2E tests
- API contracts defined in OpenSpec 3.1.0 format

### Deployment
- Development: Single host running backend + frontend
- Production: Linux CentOS with systemd services
- Cross-platform: Supports Windows WSL, macOS, and Linux development
