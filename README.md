# 磐石 Admin

多集群网关统一管理平台。你可以把它理解为一个控制平面，在同一个地方管理上游服务、路由规则、插件配置，然后统一发布到 Edge 网关节点。

## 功能特性

- **仪表盘** — 集群级别的概览视图，展示健康状态和关键指标
- **集群管理** — 添加、测试、删除网关集群，支持连接可用性验证
- **上游管理** — 配置后端服务，支持多种负载均衡策略（轮询、一致性哈希、EWMA、最少连接）和健康检查、超时配置、连接池，可发布到 Edge 节点
- **路由管理** — 按域名、路径、请求头、请求方法等条件定义匹配规则，支持高级组合条件；提供发布工作流和版本历史
- **插件管理** — 路由级插件 + 插件组（plugin_configs）+ 全局规则（global_rules），支持表单和 JSON 双模式编辑
- **插件元数据** — 定义可复用的插件模板，附带参数 schema
- **静态资源** — 为路由绑定静态资源（ZIP 文件上传），自动部署到 Edge 节点
- **Edge API 集成** — 通过 Edge 客户端将配置同步到 Edge 节点，支持直连调试
- **配置对比** — 对比本地数据库与 Edge 节点上的运行配置，高亮差异字段
- **Edge 数据导入** — 从 Edge 节点批量导入上游、路由到本地数据库
- **配置历史** — 变更记录追踪，支持回滚
- **权限控制** — 基于 JWT 的用户认证和角色权限管理

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | FastAPI + async SQLAlchemy 2.0 |
| 接口层 | Pydantic v2 |
| 用户认证 | JWT + bcrypt |
| 前端框架 | Vue 3（Composition API）+ TypeScript |
| UI 组件库 | Ant Design Vue |
| 状态管理 | Pinia |
| 构建工具 | Vite（前端）/ uv（后端 Python） |
| 前端测试 | Playwright（E2E）+ Vitest（单元） |
| 后端测试 | pytest + pytest-asyncio |
| 开发数据库 | SQLite（`backend/data/panshi.db`） |
| 生产数据库 | PostgreSQL（Docker） |

## 快速开始

### 环境要求

- Python 3.11+，包管理工具 [uv](https://docs.astral.sh/uv/)
- Node.js 18+
- 开发模式下后端使用 SQLite，无需额外安装数据库

### 启动后端

```bash
cd backend
uv sync
mkdir -p data
uv run uvicorn app.main:app --reload --port 9000
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端运行在 `http://localhost:9100`，Vite 自动将 `/api` 请求代理到后端 9000 端口。

### 登录

打开 `http://localhost:9100`，使用以下账号登录：

| 用户名 | 密码 |
|---|---|
| `admin` | `panshi123` |

### Docker 部署（可选）

```bash
docker-compose up -d
```

Docker 部署前端通过 nginx 运行在 3000 端口，后端 PostgreSQL 使用 5432 端口。

### Windows 启动

```powershell
# 首次 setup
pip install uv -i https://pypi.tuna.tsinghua.edu.cn/simple --break-system-packages
cd backend && uv sync
cd ../frontend && npm install

# 启动
.\windows\win-start.ps1

# 停止
.\windows\win-stop.ps1
```

### Linux 一键启停

```bash
# 启动
./linux/start.sh

# 停止
./linux/stop.sh
```

首次使用先执行 `chmod +x linux/*.sh`。

## 项目结构

```
├── backend/                      # Python FastAPI 服务端
│   ├── app/
│   │   ├── api/v1/               # REST API 路由
│   │   │   ├── auth.py           —   登录、令牌刷新
│   │   │   ├── users.py          —   用户管理
│   │   │   ├── clusters.py       —   集群/上游/插件组/全局规则 CRUD
│   │   │   ├── routes.py         —   路由 CRUD + 发布
│   │   │   ├── plugins.py        —   内置插件列表
│   │   │   ├── plugin_metadata.py—   插件元数据模板
│   │   │   ├── static_resources.py—  静态资源 CRUD
│   │   │   ├── edge_client.py    —   Edge 节点直连 API
│   │   │   ├── edge_import.py    —   Edge 数据导入 API
│   │   │   └── dashboard.py      —   仪表盘统计
│   │   ├── core/                 —   数据库引擎、安全配置
│   │   ├── models/               —   SQLAlchemy ORM 模型
│   │   ├── schemas/              —   Pydantic 请求/响应结构
│   │   ├── services/             —   业务逻辑层（EdgeClient、EdgeImport等）
│   │   └── config/               —   YAML 配置（字段等价规则等）
│   ├── tests/                    —   pytest 测试
│   ├── data/                     —   SQLite 数据库文件
│   └── pyproject.toml
│
├── frontend/                     # Vue 3 前端应用
│   ├── src/
│   │   ├── api/                  —   Axios HTTP 客户端
│   │   ├── components/           —   通用 Vue 组件
│   │   ├── views/                —   页面级组件
│   │   │   ├── clusters/         —   集群子页面 Tab 组件
│   │   ├── composables/          —   可复用状态逻辑（CRUD 操作、工具函数）
│   │   ├── router/               —   Vue Router 配置
│   │   ├── stores/               —   Pinia 状态管理
│   │   ├── types/                —   TypeScript 类型定义
│   │   └── e2e/                  —   Playwright E2E 测试
│   ├── playwright.config.ts
│   └── package.json
│
├── deployment/                   —   部署配置（systemd 服务文件）
│   ├── panshi-backend.service
│   └── panshi-frontend.service
├── linux/                        —   Linux 开发启动/停止
├── windows/                      —   Windows 开发启动/停止（PowerShell）
├── develop/                      —   开发启动脚本（同 linux/ windows/，从 develop/ 子目录启动）
│   ├── linux/                    —   Linux 开发启动/停止
│   └── windows/                  —   Windows 开发启动/停止
├── prepare/                      —   离线部署脚本
│   ├── linux/                    —   Linux 部署（prepare + 启动/停止）
│   └── windows/                  —   Windows 部署（prepare + 启动/停止）
├── docs/                         —   设计文档、Edge API 参考
├── openspec/                     —   变更工件和技术规格
│   └── specs/                    —   main specs（功能规格）
└── docker-compose.yml
```

## 开发说明

- **开发数据库**：后端使用 `backend/data/panshi.db`（SQLite），无需额外配置。首次启动自动创建表和初始数据（含演示样例库 `backend/data/sample.db`）。
- **前端代理**：在 `vite.config.ts` 中配置，前端访问 `/api/*` 时自动转发到 `localhost:9000`。
- **新增功能的开发顺序**：`schemas/` 定义 Pydantic 模型 → `models/` 定义 ORM 模型 → `api/v1/` 添加路由 → 前端 Composable + 页面。
- **测试**：后端测试在 `backend/tests/`（pytest-asyncio），前端 E2E 测试在 `frontend/e2e/`（Playwright），前端单元测试在 `frontend/src/**/__tests__/`（Vitest）。
- **需求文档**：所有功能的技术规格和变更历史都在 `openspec/` 中管理，并纳入版本控制。
