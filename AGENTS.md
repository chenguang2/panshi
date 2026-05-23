# 磐石 Admin — AI 代理指南

## 产品标识

- **产品名**：磐石Admin（不是"盘石"）
- **项目**：多集群网关统一管理平台（Edge 网关配置管理）
- **界面语言**：中文内联文本，不使用 i18n 库

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | FastAPI + async SQLAlchemy 2.0 |
| 数据校验 | Pydantic v2 |
| 认证 | JWT + bcrypt |
| 前端框架 | Vue 3（Composition API）+ TypeScript |
| UI 组件库 | Ant Design Vue |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 构建工具 | Vite（前端）/ uv（后端 Python） |
| 前端测试 | Playwright（E2E）+ Vitest（单元） |
| 后端测试 | pytest + pytest-asyncio |
| 数据库 | SQLite（开发）/ PostgreSQL（Docker 生产） |

## 端口

| 服务 | 开发端口 | Docker 端口 |
|---|---|---|
| 后端 | 9000 | 8000 |
| 前端 | 9100 | 9100（代理转发） |

Vite 代理将 `/api` 请求转发到 `localhost:9000`。
Docker 部署前端通过 nginx 运行在 3000 端口（`docker-compose.yml`）。

## 常用命令

```bash
# 后端启动（开发）
cd backend && mkdir -p data && uv sync && uv run uvicorn app.main:app --reload --port 9000

# 前端启动（开发）
cd frontend && npm install && npm run dev

# 后端测试
cd backend && uv run pytest

# 前端 E2E 测试
cd frontend && npx playwright test

# 前端单元测试
cd frontend && npx vitest run

# 前端构建
cd frontend && npm run build

# 默认登录
# admin / panshi123 访问 http://localhost:9100
```

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
│   │   │   ├── plugin_metadata.py—   插件元数据 CRUD
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
│   │   ├── components/           —   通用 Vue 组件（PluginEditor、VersionManagementModal 等）
│   │   ├── views/                —   页面级组件
│   │   │   ├── clusters/         —   集群子页面 Tab 组件
│   │   ├── views/__tests__/      —   前端单元测试
│   │   ├── composables/          —   可复用状态逻辑（CRUD 操作、工具函数）
│   │   ├── router/               —   Vue Router 配置
│   │   ├── stores/               —   Pinia 状态管理
│   │   ├── types/                —   TypeScript 类型定义
│   │   └── e2e/                  —   Playwright E2E 测试
│   ├── playwright.config.ts
│   └── package.json
│
├── deployment/                   —   部署配置（systemd 服务文件）
├── linux/                        —   Linux 开发启动/停止脚本
├── windows/                      —   Windows 开发启动/停止脚本（PowerShell）
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

## 关键约定

1. **登录输入框必须保留 `id` 属性** — Playwright 测试依赖 `#username` 和 `#password` 选择器，切勿删除或改名。
2. **后端入口为 `app.main:app`** — 不是根目录的 `main:app`。
3. **数据访问直连模式** — 不使用 Repository 模式，DB 操作直接在 route handler 中通过 SQLAlchemy 执行（`select()` / `execute()`）。`backend/app/repositories/` 目录已废弃。
4. **插件编辑器支持双模式** — 表单编辑和 JSON 编辑都支持，不可移除任一模式。
5. **代码禁用** `as any`、`@ts-ignore`、`@ts-expect-error`。
6. **EdgeClient 方法统一** — 所有资源方法已合并为 `api(resource, action, ...)` 通用方法，旧方法名保留为兼容代理。
7. **发布/删除流程统一** — 使用 `useClusterUtils.ts` 中的 `executePublish` 和 `executeDeleteWithProgress` 共享函数，不要在 composable 中重复实现进度弹窗逻辑。

## 新增功能步骤

1. 在 `schemas/` 定义 Pydantic 模型
2. 在 `models/` 定义 SQLAlchemy 模型
3. 在 `api/v1/` 添加路由（无 Repository/Service 层）
4. 前端添加对应 API 调用、Composable、页面

## Git 规则

**提交：**
- `uv.lock`（可重现构建所需）
- `openspec/`（全部变更工件，不包括 `.openspec/`）
- `docs/edge/*.log`（API 示例文件）
- `.opencode/skills/` 和 `.opencode/command/`（AI 工具配置）
- `backend/data/sample.db`（演示样例库，已 force-add）

**忽略：**
- `.venv/`、`node_modules/`（含 `.opencode/node_modules/`）
- `*.db`（`sample.db` 除外）、`*.sqlite`、`*.sqlite3`
- `.env*`（`.env.example` 除外）
- `.openspec/`（OpenSpec 内部缓存）
- `.playwright-mcp/`（浏览器录制缓存）
- `.history/`（prompt 历史记录）
- `*.log`（`docs/**/*.log` 除外）
- `backend/uvicorn.err`（运行时错误输出）
- `session-*.md`（会话记录）
- `.codegraph/`（代码分析缓存）

## 快速检查清单

- [ ] 产品名拼写为"磐石"（不是"盘石"）
- [ ] 登录表单包含 `id="username"` 和 `id="password"`
- [ ] 新增后端依赖 → 写入 `pyproject.toml`（不是 `requirements.txt`）
- [ ] 新增前端依赖 → 写入 `frontend/package.json`
- [ ] 无 `as any` / `@ts-ignore` / `@ts-expect-error` 类型逃逸
