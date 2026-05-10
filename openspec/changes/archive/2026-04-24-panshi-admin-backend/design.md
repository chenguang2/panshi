## Context

Panshi is a multi-cluster gateway management platform that manages routing configurations for multiple gateway clusters. The system stores all configuration locally in a database and provides a publishing mechanism to synchronize configurations to target clusters via their Admin API endpoints.

### Current State
- No existing system - greenfield development
- Target users: DevOps engineers and system administrators managing gateway configurations

### Constraints
- Must support development on Windows WSL, macOS, and deployment on Linux CentOS
- Database must seamlessly switch between SQLite (development) and PostgreSQL (production)
- User configurations must be isolated by cluster assignments
- All configuration changes must be versioned with rollback capability

### Stakeholders
- DevOps teams managing multiple gateway clusters
- System administrators controlling user access
- Developers integrating with gateway clusters

## Goals / Non-Goals

**Goals:**
- Provide unified management UI for multiple gateway clusters
- Store configuration locally with full audit trail
- Support manual publish workflow with sync status feedback
- Enable configuration rollback to any previous version
- Dual-mode plugin configuration (form-based and JSON editor)
- Seamless database switching without code changes

**Non-Goals:**
- Real-time sync or automatic deployment (manual publish only)
- Direct etcd management (only Admin API)
- Plugin custom development or file-based plugins
- Health check configuration UI (default enabled, no customization)
- Multi-tenancy isolation (cluster-level isolation only)

## Decisions

### Decision 1: Monolithic Backend Architecture

**Choice**: Modular monolith using FastAPI with layered architecture (API → Service → Repository)

**Rationale**:
- Team size is small (1-3 developers), microservices overhead unjustified
- Single database acceptable for configuration storage
- FastAPI provides excellent async support and automatic OpenAPI generation
- Layered architecture allows future service extraction if needed

**Alternatives Considered**:
- Microservices: Overkill for configuration management, adds operational complexity
- Django: Less async-native, heavier weight for this use case

### Decision 2: SQLAlchemy 2.0 ORM with Async Support

**Choice**: SQLAlchemy 2.0 async_session with async_engine

**Rationale**:
- Unified ORM for both SQLite and PostgreSQL
- Async support essential for high-concurrency API handling
- DeclarativeBase provides clean model definition
- Single `DATABASE_URL` environment variable controls database selection

**Alternatives Considered**:
- Raw SQL: Loses ORM benefits, harder to maintain
- Prisma: Python ecosystem less mature than JavaScript
- SQLAlchemy 1.x: 2.0 has better async story

### Decision 3: JWT Authentication with Local User Store

**Choice**: JWT tokens with user passwords stored in local database (bcrypt hashed)

**Rationale**:
- Stateless authentication scales horizontally
- bcrypt cost factor 12 provides strong password protection
- JWT expiry (24h) balances security and usability
- No external auth service dependency

**Alternatives Considered**:
- OAuth2/OIDC: Adds identity provider complexity for internal tool
- Session-based: Requires session store, less scalable

### Decision 4: Gateway Admin API Client (httpx)

**Choice**: httpx AsyncClient for gateway communication

**Rationale**:
- httpx is async-native, matches FastAPI async model
- Connection pooling and timeout handling built-in
- Easy mocking in tests

**Alternatives Considered**:
- aiohttp: Less modern API
- requests: Blocking, not async-native

### Decision 5: Vue 3 Composition API with TypeScript

**Choice**: Vue 3 + TypeScript + Vite + Ant Design Vue

**Rationale**:
- TypeScript catches type errors at compile time
- Composition API aligns with modern frontend patterns
- Ant Design Vue provides comprehensive enterprise UI components
- Vite offers fast HMR for development experience

**Alternatives Considered**:
- React: Vue equally capable, team's preference drives choice
- Element Plus: Ant Design Vue has slightly better enterprise components

### Decision 6: pytest + Playwright Testing Stack

**Choice**: pytest-asyncio for backend, Playwright for frontend E2E

**Rationale**:
- pytest is Python standard for backend testing
- Playwright provides reliable cross-browser E2E testing
- SQLite allows fast, isolated test databases

**Alternatives Considered**:
- unittest: Less feature-rich than pytest
- Cypress: Less modern than Playwright

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite WAL mode needed for concurrent writes | Development DB lock issues | Use `StaticPool` in SQLAlchemy, enable WAL in production PG |
| Gateway Admin API compatibility | API breaking changes in gateway updates | Version API calls, add retry with backoff |
| JWT secret exposure | Token forgery possible | Store secrets in environment variables, never in code |
| User-cluster assignment explosion | Complex permission checks | Cache user-cluster mapping in auth context |
| Large config history table | Query performance degradation | Add indexes, implement pagination, prune old records |

## Open Questions

1. **Cluster health monitoring**: Should Panshi periodically poll clusters for health status, or rely on manual refresh?
2. **Config conflict detection**: Should the system detect if config was modified directly on gateway and warn user?
3. **Batch publish optimization**: Should publish operation be transactional (all-or-nothing) or individual-failure isolation?
4. **Plugin schema validation**: Should built-in plugin configs be validated against JSON Schema, or accept any JSON?
5. **Audit log retention**: How long should configuration history be retained before archival?
