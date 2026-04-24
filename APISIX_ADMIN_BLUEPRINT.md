# APISIX Multi-Cluster Management Platform - Architecture Blueprint

## 1. System Overview

### 1.1 Product定位
A web management platform for managing multiple APISIX gateway clusters. The platform stores configuration in local database and synchronizes to APISIX clusters via Admin API when user publishes changes.

### 1.2 Core Features
| Feature | Description |
|---------|-------------|
| User Management | Login, logout, password reset, role-based access |
| Cluster Management | Add/edit/delete APISIX clusters (Admin API endpoint + key) |
| Upstream Management | Create/edit/delete upstream targets per cluster |
| Route Management | Create/edit/delete routes with upstream binding |
| Plugin Configuration | Configure built-in plugin parameters per route/service |
| Config Publishing | Sync local config to APISIX cluster via Admin API |
| Dictionary Management | System-level enum values (HTTP methods, plugin types, etc.) |

### 1.3 System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Vue 3 Frontend                             │
│   Ant Design Vue │ Axios │ Pinia │ Vue Router │ TypeScript       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│   REST API │ Pydantic DTO │ SQLAlchemy 2.0 │ JWT Auth            │
└─────────────────────────────────────────────────────────────────┘
         │                                           │
         ▼                                           ▼
┌─────────────────────┐                 ┌─────────────────────────┐
│   Local Database    │                 │   APISIX Admin API      │
│   SQLite / PG       │                 │   (Remote Gateway)      │
│   (Source of Truth) │ ─── Publish ───► │   Cluster 1..N         │
└─────────────────────┘                 └─────────────────────────┘
```

## 2. Database Design

### 2.1 Entity Relationship
```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    User      │       │   Cluster     │       │   Upstream   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │       │ id (PK)      │◄──┐   │ id (PK)      │
│ username     │       │ name         │    │   │ cluster_id   │
│ password     │       │ admin_url    │    │   │ name         │
│ role         │       │ admin_key    │    │   │ type         │
│ created_at   │       │ description  │    │   │ targets     │
│ updated_at   │       │ status       │    │   │ checks      │
└──────────────┘       │ created_at   │    │   │ created_at  │
                       └──────────────┘    │   └──────────────┘
                                          │          │
                    ┌─────────────────────┘          │
                    │ 1:N                           │
                    ▼                               ▼
              ┌──────────────┐              ┌──────────────┐
              │    Route     │              │    Service   │
              ├──────────────┤              ├──────────────┤
              │ id (PK)      │              │ id (PK)      │
              │ cluster_id   │              │ cluster_id   │
              │ name         │              │ name         │
              │ uri          │              │ upstream_id  │
              │ methods     │              │ plugins      │
              │ upstream_id │              │ created_at   │
              │ plugins      │              └──────────────┘
              │ status       │
              │ created_at  │
              └──────────────┘
                     │
                     │ N:1 (via route_id)
                     ▼
              ┌──────────────────┐
              │  RoutePlugin     │
              ├──────────────────┤
              │ id (PK)          │
              │ route_id         │
              │ plugin_name      │
              │ plugin_config    │
              │ enabled          │
              └──────────────────┘
```

### 2.2 Core Models

#### User Model
```python
# backend/app/models/user.py
from sqlalchemy import Column, Integer, String, DateTime
from app.core.database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "sys_user"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)  # bcrypt hashed
    role = Column(String(20), nullable=False, default="user")  # "admin" | "user"
    status = Column(String(1), nullable=False, default="1")  # "1"=active, "0"=inactive
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
```

#### Cluster Model
```python
# backend/app/models/cluster.py
class Cluster(Base):
    __tablename__ = "cmdb_cluster"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    admin_url = Column(String(500), nullable=False)  # e.g. "http://192.168.1.100:9180"
    admin_key = Column(String(255), nullable=False)
    description = Column(String(500))
    status = Column(String(1), nullable=False, default="1")  # "1"=active, "0"=inactive
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
```

#### Upstream Model
```python
# backend/app/models/upstream.py
class Upstream(Base):
    __tablename__ = "cmdb_upstream"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cluster_id = Column(Integer, ForeignKey("cmdb_cluster.id"), nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False, default="roundrobin")  # roundrobin | chash | leastconn
    description = Column(String(500))
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    # targets stored as JSON in separate table or serialized
```

#### UpstreamTarget Model
```python
# backend/app/models/upstream.py
class UpstreamTarget(Base):
    __tablename__ = "cmdb_upstream_target"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upstream_id = Column(Integer, ForeignKey("cmdb_upstream.id"), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False)
    weight = Column(Integer, default=100)
    priority = Column(Integer, default=0)  # for fallback upstream
```

#### Route Model
```python
# backend/app/models/route.py
class Route(Base):
    __tablename__ = "cmdb_route"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cluster_id = Column(Integer, ForeignKey("cmdb_cluster.id"), nullable=False)
    name = Column(String(100), nullable=False)
    uri = Column(String(500), nullable=False)  # e.g. "/api/users/*"
    methods = Column(String(200))  # JSON array: ["GET", "POST"]
    upstream_id = Column(Integer, ForeignKey("cmdb_upstream.id"), nullable=False)
    priority = Column(Integer, default=0)  # route matching priority
    status = Column(String(1), nullable=False, default="1")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
```

#### RoutePlugin Model
```python
# backend/app/models/route.py
class RoutePlugin(Base):
    __tablename__ = "cmdb_route_plugin"

    id = Column(Integer, primary_key=True, autoincrement=True)
    route_id = Column(Integer, ForeignKey("cmdb_route.id"), nullable=False)
    plugin_name = Column(String(100), nullable=False)
    plugin_config = Column(Text)  # JSON string
    enabled = Column(String(1), nullable=False, default="1")
```

#### Dictionary Models (参考若依)
```python
# backend/app/models/dict.py
class SysDictType(Base):
    __tablename__ = "sys_dict_type"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    code = Column(String(100), unique=True, nullable=False)
    status = Column(String(1), default="1")
    remark = Column(String(500))
    created_at = Column(DateTime, default=datetime.now)

class SysDictData(Base):
    __tablename__ = "sys_dict_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type_id = Column(Integer, ForeignKey("sys_dict_type.id"), nullable=False)
    label = Column(String(100), nullable=False)
    value = Column(String(100), nullable=False)
    sort = Column(Integer, default=0)
    status = Column(String(1), default="1")
```

### 2.3 字典数据初始值
| Type Code | Type Name | Sample Values |
|-----------|-----------|---------------|
| route_methods | HTTP Methods | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
| upstream_type | Load Balance | roundrobin, chash, leastconn |
| cluster_status | Cluster Status | 1=Active, 0=Inactive |
| user_role | User Role | admin, user |
| pluginbuiltin | Built-in Plugins | rate-limit, cors, jwt-auth, apikey-auth, proxy-rewrite |

## 3. API Design

### 3.1 Base URL Structure
```
/api/v1/*
```

### 3.2 Authentication APIs
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/auth/login | User login |
| POST | /api/v1/auth/logout | User logout |
| GET | /api/v1/auth/me | Get current user |
| PUT | /api/v1/auth/password | Change password |
| PUT | /api/v1/admin/users/{id}/password | Admin reset user password |

### 3.3 User Management APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/admin/users | List all users (admin only) |
| GET | /api/v1/admin/users/{id} | Get user by ID |
| POST | /api/v1/admin/users | Create user (admin only) |
| PUT | /api/v1/admin/users/{id} | Update user |
| DELETE | /api/v1/admin/users/{id} | Delete user (admin only) |

### 3.4 Cluster Management APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/clusters | List clusters |
| GET | /api/v1/clusters/{id} | Get cluster details |
| POST | /api/v1/clusters | Create cluster |
| PUT | /api/v1/clusters/{id} | Update cluster |
| DELETE | /api/v1/clusters/{id} | Delete cluster |
| POST | /api/v1/clusters/{id}/test | Test cluster connection |
| POST | /api/v1/clusters/{id}/sync | Sync all config to cluster |

### 3.5 Upstream Management APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/clusters/{cluster_id}/upstreams | List upstreams |
| GET | /api/v1/clusters/{cluster_id}/upstreams/{id} | Get upstream |
| POST | /api/v1/clusters/{cluster_id}/upstreams | Create upstream |
| PUT | /api/v1/clusters/{cluster_id}/upstreams/{id} | Update upstream |
| DELETE | /api/v1/clusters/{cluster_id}/upstreams/{id} | Delete upstream |

### 3.6 Route Management APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/clusters/{cluster_id}/routes | List routes |
| GET | /api/v1/clusters/{cluster_id}/routes/{id} | Get route |
| POST | /api/v1/clusters/{cluster_id}/routes | Create route |
| PUT | /api/v1/clusters/{cluster_id}/routes/{id} | Update route |
| DELETE | /api/v1/clusters/{cluster_id}/routes/{id} | Delete route |
| POST | /api/v1/clusters/{cluster_id}/routes/{id}/publish | Publish single route |
| POST | /api/v1/clusters/{cluster_id}/routes/publish | Publish all routes |

### 3.7 Dictionary APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/dict/types | List dict types |
| GET | /api/v1/dict/datas/{code} | Get dict data by code |
| GET | /api/v1/dict/datas | Get all dict data |
| POST | /api/v1/dict/types | Create dict type |
| POST | /api/v1/dict/datas | Create dict data |
| PUT | /api/v1/dict/types/{id} | Update dict type |
| PUT | /api/v1/dict/datas/{id} | Update dict data |
| DELETE | /api/v1/dict/types/{id} | Delete dict type |
| DELETE | /api/v1/dict/datas/{id} | Delete dict data |

### 3.8 Plugin APIs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/plugins/builtin | List built-in plugins |
| GET | /api/v1/clusters/{cluster_id}/routes/{id}/plugins | Get route plugins |
| PUT | /api/v1/clusters/{cluster_id}/routes/{id}/plugins | Update route plugins |

## 4. Frontend Structure

### 4.1 Directory Structure
```
frontend/src/
├── api/                    # Axios API modules
│   ├── axios.ts           # Axios instance config
│   ├── auth.ts            # Auth APIs
│   ├── user.ts            # User APIs
│   ├── cluster.ts         # Cluster APIs
│   ├── upstream.ts        # Upstream APIs
│   ├── route.ts           # Route APIs
│   └── dict.ts            # Dictionary APIs
│
├── assets/
│   ├── styles/
│   │   ├── variables.scss # CSS variables
│   │   └── common.scss    # Global styles
│   └── images/
│
├── components/             # Reusable components
│   ├── common/
│   │   ├── PageHeader.vue
│   │   ├── DataTable.vue
│   │   └── FormModal.vue
│   └── layout/
│       ├── DefaultLayout.vue
│       ├── Sidebar.vue
│       └── Header.vue
│
├── composables/            # Vue 3 Composables
│   ├── useAuth.ts
│   ├── useApi.ts
│   └── useDict.ts
│
├── router/
│   ├── index.ts
│   └── routes.ts
│
├── store/                  # Pinia Store
│   ├── auth.ts
│   ├── user.ts
│   └── dict.ts
│
├── types/                  # TypeScript definitions
│   ├── api.ts
│   ├── user.ts
│   ├── cluster.ts
│   ├── upstream.ts
│   ├── route.ts
│   └── dict.ts
│
├── utils/                  # Utilities
│   ├── request.ts         # Axios wrapper
│   └── storage.ts
│
└── views/                  # Page components
    ├── auth/
    │   ├── Login.vue
    │   └── ...
    ├── dashboard/
    │   └── Dashboard.vue
    ├── system/
    │   ├── UserManage.vue
    │   └── DictManage.vue
    ├── cluster/
    │   ├── ClusterList.vue
    │   └── ClusterDetail.vue
    ├── upstream/
    │   ├── UpstreamList.vue
    │   └── UpstreamForm.vue
    └── route/
        ├── RouteList.vue
        └── RouteForm.vue
```

### 4.2 Key Pages

#### Dashboard
- System overview statistics
- Cluster status list with health indicators
- Recent routes modified

#### Cluster Management
- Cluster list with status
- Add/Edit cluster modal (admin_url, admin_key)
- Test connection button
- Sync button
- Delete with confirmation

#### Upstream Management
- Upstream list filtered by cluster
- Add/Edit upstream modal
- Target nodes editor (host:port:weight)
- Load balance type selector

#### Route Management
- Route list filtered by cluster
- Route editor with:
  - URI pattern input
  - HTTP methods multi-select
  - Upstream selector
  - Plugins toggle panel
- Publish button per route
- Bulk publish

#### Plugin Configuration
- Plugin list for current route
- JSON editor for plugin config
- Enable/disable toggle

### 4.3 Menu Structure
```
├── Dashboard
├── System Management
│   ├── User Management (admin only)
│   └── Dictionary Management
├── Cluster Management
│   ├── Cluster List
│   └── [Cluster Detail]
│       ├── Upstream List
│       ├── Route List
│       └── Plugin Config
└── Personal Center
    ├── Profile
    └── Change Password
```

## 5. Database Switching Strategy

### 5.1 SQLAlchemy 2.0 Abstract Layer
```python
# backend/app/core/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
import os

class Base(DeclarativeBase):
    pass

def get_database_url() -> str:
    env = os.getenv("ENV", "development")
    if env == "production":
        return os.getenv(
            "DATABASE_URL",
            "postgresql://apisyx:password@localhost:5432/apisix_admin"
        )
    # Development: SQLite with file-based storage
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "cmdb.db")
    return f"sqlite:///{db_path}"

# Engine creation
connect_args = {}
if "sqlite" in get_database_url():
    # SQLite specific: enable foreign keys, use StaticPool for shared connection
    connect_args = {"check_same_thread": False}

engine = create_engine(
    get_database_url(),
    connect_args=connect_args,
    poolclass=StaticPool if "sqlite" in get_database_url() else None,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 5.2 Migration Strategy
```bash
# Using Alembic for database migrations
alembic init alembic
alembic revision --autogenerate -m "initial migration"
alembic upgrade head
```

### 5.3 Cross-Platform Considerations
| Issue | Solution |
|-------|----------|
| SQLite path separator | Use `pathlib.Path` or `os.path.join` |
| Windows WSL path | `/app/data/` works in both |
| Mac development | Same relative path |
| Production path | Use environment variable override |
| File locking | SQLite WAL mode for concurrent reads |
| Connection string | Environment variable `DATABASE_URL` |

## 6. Config Sync Strategy

### 6.1 APISIX Admin API Client
```python
# backend/app/core/apisix_client.py
import httpx
from typing import Optional, Dict, Any

class APISIXClient:
    def __init__(self, admin_url: str, admin_key: str):
        self.admin_url = admin_url.rstrip("/")
        self.admin_key = admin_key
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"X-API-KEY": admin_key}
        )

    async def get_cluster_info(self) -> Dict[str, Any]:
        """Get APISIX cluster info"""
        response = await self.client.get(f"{self.admin_url}/apisix/admin/start")
        response.raise_for_status()
        return response.json()

    async def create_upstream(self, upstream_id: str, config: Dict) -> Dict:
        response = await self.client.put(
            f"{self.admin_url}/apisix/admin/upstreams/{upstream_id}",
            json=config
        )
        response.raise_for_status()
        return response.json()

    async def create_route(self, route_id: str, config: Dict) -> Dict:
        response = await self.client.put(
            f"{self.admin_url}/apisix/admin/routes/{route_id}",
            json=config
        )
        response.raise_for_status()
        return response.json()

    async def delete_route(self, route_id: str) -> Dict:
        response = await self.client.delete(
            f"{self.admin_url}/apisix/admin/routes/{route_id}"
        )
        return response.json()

    async def close(self):
        await self.client.aclose()
```

### 6.2 Sync Workflow
```
User clicks "Publish"
       │
       ▼
┌──────────────────┐
│ Validate Config  │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ Convert to       │
│ APISIX Admin API │
│ JSON format      │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ Call APISIX      │
│ Admin API        │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ Log sync result  │
│ (success/fail)   │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ Return result    │
│ to frontend      │
└──────────────────┘
```

### 6.3 Route → APISIX Format Conversion
```python
# backend/app/services/route_sync.py
async def sync_route_to_apisix(cluster: Cluster, route: Route) -> bool:
    apisix_config = {
        "id": str(route.id),
        "uri": route.uri,
        "methods": route.methods,
        "upstream_id": str(route.upstream_id),
        "plugins": build_plugins_config(route.plugins),
        "priority": route.priority,
        "status": 1 if route.status == "1" else 0,
    }

    client = APISIXClient(cluster.admin_url, cluster.admin_key)
    try:
        await client.create_route(str(route.id), apisix_config)
        return True
    finally:
        await client.close()
```

## 7. Security Design

### 7.1 Authentication
- JWT token in `Authorization: Bearer <token>` header
- Token expiry: 24 hours (configurable)
- Refresh token mechanism

### 7.2 Authorization
| Role | Permissions |
|------|------------|
| admin | All operations + user management |
| user | CRUD on cluster/upstream/route (own cluster only) |

### 7.3 Password Storage
- bcrypt with cost factor 12
- Never log or return plain passwords

## 8. Testing Strategy

### 8.1 Backend (pytest)
```python
# backend/tests/api/v1/test_cluster.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_cluster():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Login first
        await client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})

        # Create cluster
        response = await client.post(
            "/api/v1/clusters",
            json={"name": "test", "admin_url": "http://localhost:9180", "admin_key": "key"}
        )
        assert response.status_code == 201
```

### 8.2 Frontend (Playwright)
```typescript
// frontend/tests/e2e/cluster.spec.ts
import { test, expect } from '@playwright/test';

test('cluster management', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="username"]', 'admin');
  await page.fill('[name="password"]', 'admin123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await page.click('text=Cluster Management');
  await expect(page.locator('text=Cluster List')).toBeVisible();
});
```

## 9. Project Initialization Checklist

### 9.1 Backend
```bash
# Create project with uv
mkdir -p backend && cd backend
uv init --name apisix-admin

# Add dependencies
uv add fastapi uvicorn sqlalchemy pydantic python-jose[cryptography] passlib[bcrypt] httpx
uv add --dev pytest pytest-asyncio pytest-cov httpx

# Create directory structure
mkdir -p app/{api/v1,core,models,schemas,services,repositories,utils}
mkdir -p tests/{api/v1,unit}
mkdir -p data  # SQLite files
```

### 9.2 Frontend
```bash
# Create Vue 3 project
npm create vite@latest frontend -- --template vue-ts
cd frontend
npm install

# Add dependencies
npm install ant-design-vue axios pinia vue-router
npm install --save-dev @playwright/test
```

## 10. Environment Configuration

### 10.1 .env.development
```bash
ENV=development
DATABASE_URL=sqlite:///./data/cmdb.db
SECRET_KEY=dev-secret-key-change-in-production
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
SQL_ECHO=false
```

### 10.2 .env.production
```bash
ENV=production
DATABASE_URL=postgresql://apisix_admin:your-password@pghost:5432/apisix_admin
SECRET_KEY=your-production-secret-key
JWT_SECRET=your-production-jwt-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
SQL_ECHO=false
LOG_LEVEL=INFO
```

## 11. Key Design Decisions

### 11.1 Why not manage APISIX etcd directly?
- etcd is internal to APISIX server, often not exposed
- Using Admin API is the documented and supported way
- Easier to manage multiple clusters from single point

### 11.2 Why local DB + APISIX sync?
- Allows configuration validation before publish
- Enables configuration history and rollback
- Supports multi-cluster atomic operations
- Backup and audit trail

### 11.3 Why SQLite for development?
- Zero configuration, works out of box
- No external service to run
- File-based, easy to share in team
- SQLAlchemy handles the switching seamlessly

## 12. Open Questions for User

1. **配置同步触发方式**: 用户手动点击"发布"还是自动实时同步？
2. **多集群路由隔离**: 普通用户是否只能管理自己被分配的集群？
3. **配置版本历史**: 是否需要保存配置变更历史支持回滚？
4. **插件配置UI**: 插件参数是用JSON编辑器还是表单式配置？
5. **健康检查配置**: 上游健康检查参数是否需要在UI中配置？

---

*Blueprint Version: 1.0*
*Date: 2026-04-24*
