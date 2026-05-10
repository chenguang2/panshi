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
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |

## 端口

| 服务 | 开发端口 | Docker 端口 |
|---|---|---|
| 后端 | 9000 | 8000 |
| 前端 | 9100 | 9100（代理转发） |

Vite 代理将 `/api` 请求转发到 `localhost:9000`。

## 常用命令

```bash
# 后端启动
cd backend && mkdir -p data && uv sync && uv run uvicorn app.main:app --reload --port 9000

# 前端启动
cd frontend && npm install && npm run dev

# 后端测试
cd backend && uv run pytest

# 前端 E2E 测试
cd frontend && npx playwright test

# 默认登录
# admin / panshi123 访问 http://localhost:9100
```

## 关键约定

1. **登录输入框必须保留 `id` 属性** — Playwright 测试依赖 `#username` 和 `#password` 选择器，切勿删除或改名。
2. **后端入口为 `app.main:app`** — 不是根目录的 `main:app`。
3. **Repository + Service 模式** — `app/repositories/` 负责数据访问，`app/services/` 负责业务逻辑，Controller 保持薄层。
4. **插件编辑器支持双模式** — 表单编辑和 JSON 编辑都支持，不可移除任一模式。
5. **代码禁用** `as any`、`@ts-ignore`、`@ts-expect-error`。

## 新增功能步骤

1. 在 `schemas/` 定义 Pydantic 模型
2. 在 `models/` 定义 SQLAlchemy 模型
3. 在 `repositories/` 实现数据访问层
4. 在 `services/` 实现业务逻辑层
5. 在 `api/v1/` 添加路由
6. 前端添加对应 API 调用、Store、页面

## Git 规则

**提交：**
- `uv.lock`（可重现构建所需）
- `openspec/`（全部变更工件，不包括 `.openspec/`）
- `docs/edge/*.log`（API 示例文件）
- `.opencode/skills/` 和 `.opencode/command/`（工具配置）

**忽略：**
- `.venv/`、`node_modules/`（含 `.opencode/node_modules/`）
- `*.db`、`*.sqlite`、`*.sqlite3`（数据库文件）
- `.env*`（`.env.example` 除外）
- `.openspec/`（OpenSpec 内部缓存）
- `.playwright-mcp/`（浏览器录制缓存）
- `.history/`（prompt 历史记录）
- `*.log`（`docs/**/*.log` 除外）
- 截图文件（`cluster-*.png`、`upstream-tab.png`）
- `backend/uvicorn.err`（运行时错误输出）
- `session-*.md`（会话记录）

## 快速检查清单

- [ ] 产品名拼写为"磐石"（不是"盘石"）
- [ ] 登录表单包含 `id="username"` 和 `id="password"`
- [ ] 新增后端依赖 → 写入 `pyproject.toml`（不是 `requirements.txt`）
- [ ] 新增前端依赖 → 写入 `frontend/package.json`
- [ ] 无 `as any` / `@ts-ignore` / `@ts-expect-error` 类型逃逸
