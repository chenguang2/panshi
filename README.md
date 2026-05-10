# 磐石 Admin

多集群网关统一管理平台。你可以把它理解为一个控制平面，在同一个地方管理上游服务、路由规则、插件配置和字典数据，然后统一发布到 Edge 网关节点。

## 功能特性

- **仪表盘** — 集群级别的概览视图，展示健康状态和关键指标
- **集群管理** — 添加、测试、删除网关集群，支持连接可用性验证
- **上游管理** — 配置后端服务，支持多种负载均衡策略（轮询、一致性哈希等）和健康检查，可发布到 Edge 节点
- **路由管理** — 按域名、路径、请求头、请求方法等条件定义匹配规则，支持高级组合条件；提供发布工作流和版本历史
- **插件配置** — 双模式编辑器（表单 + JSON），覆盖内置插件（CORS、代理重写、限流、安全过滤、日志等），支持元数据模板实现可复用配置
- **插件元数据** — 定义可复用的插件模板，附带参数 schema
- **Edge API 集成** — 通过 Edge 客户端将上游和路由配置同步到 Edge 节点
- **配置历史** — 变更记录追踪，支持回滚
- **字典管理** — 维护系统中使用的枚举值和字典数据
- **权限控制** — 基于 JWT 的用户认证和角色权限管理

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | FastAPI + async SQLAlchemy 2.0 |
| 接口层 | Pydantic v2 + Repository/Service 模式 |
| 用户认证 | JWT + bcrypt |
| 前端框架 | Vue 3（Composition API）+ TypeScript |
| UI 组件库 | Ant Design Vue |
| 状态管理 | Pinia |
| 构建工具 | Vite（前端）/ uv（后端） |
| 开发数据库 | SQLite |
| 生产数据库 | PostgreSQL |

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

## 项目结构

```
├── backend/                      # Python FastAPI 服务端
│   ├── app/
│   │   ├── api/v1/               # REST API 路由
│   │   │   ├── auth.py           ─   登录、令牌刷新
│   │   │   ├── users.py          ─   用户管理
│   │   │   ├── clusters.py       ─   集群管理
│   │   │   ├── routes.py         ─   路由 CRUD + 发布
│   │   │   ├── plugins.py        ─   插件配置
│   │   │   ├── plugin_metadata.py─   插件元数据模板
│   │   │   ├── dicts.py          ─   字典管理
│   │   │   ├── dashboard.py      ─   仪表盘统计
│   │   │   └── edge_client.py    ─   Edge API 同步
│   │   ├── core/                 ─   数据库引擎、安全配置、系统设置
│   │   ├── models/               ─   SQLAlchemy ORM 模型
│   │   ├── schemas/              ─   Pydantic 请求/响应结构
│   │   ├── repositories/         ─   数据访问层
│   │   └── services/             ─   业务逻辑层
│   ├── tests/                    ─   pytest 测试
│   ├── data/                     ─   SQLite 数据库文件（已忽略）
│   └── pyproject.toml
│
├── frontend/                     # Vue 3 前端应用
│   ├── src/
│   │   ├── api/                  ─   Axios HTTP 客户端
│   │   ├── components/           ─   通用 Vue 组件
│   │   ├── views/                ─   页面级组件
│   │   ├── router/               ─   路由配置
│   │   ├── stores/               ─   Pinia 状态管理
│   │   ├── types/                ─   TypeScript 类型定义
│   │   ├── assets/               ─   静态资源
│   │   └── locales/              ─   国际化文件（当前未启用）
│   └── package.json
│
├── deployment/                   ─   部署配置（systemd 服务等）
├── linux/                        ─   Linux 启动/停止脚本
├── windows/                      ─   Windows 启动/停止脚本
├── docs/edge/                    ─   Edge API 参考文档
├── openspec/                     ─   变更工件和技术规格
└── docker-compose.yml
```

## 开发说明

- **开发数据库**：后端使用 `backend/data/panshi.db`（SQLite），无需额外配置。
- **前端代理**：在 `vite.config.ts` 中配置，前端访问 `/api/*` 时自动转发到 `localhost:9000`。
- **新增功能的开发顺序**：schema → model → repository → service → endpoint → 前端 view/store。
- **测试**：后端测试在 `backend/tests/`（pytest-asyncio），前端 E2E 测试在 `frontend/e2e/`（Playwright）。
- **一键启停**：Linux 下可使用 `linux/start.sh` 和 `linux/stop.sh` 快速启动和停止前后端服务（首次使用先执行 `chmod +x linux/*.sh`）。
- **需求文档**：所有功能的技术规格和变更历史都在 `openspec/` 中管理，并纳入版本控制。
