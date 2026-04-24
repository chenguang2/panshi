# Panshi Admin - Agent Guidelines

## 项目架构

**产品名**：磐石Admin（不要写成"盘石"）
**端口**：后端 9000，前端 9100（docker-compose.yml 中后端是 8000）

## 启动命令

```bash
# 后端（需要 Python 3.11+，使用 uv）
cd backend && mkdir -p data && uv run uvicorn app.main:app --reload --port 9000

# 前端
cd frontend && npm install && npm run dev

# 测试
cd backend && uv run pytest                    # 后端单元测试
cd frontend && npx playwright test             # 前端 E2E 测试
```

## 关键配置

- **前端代理**：`vite.config.ts` 将 `/api` 请求转发到 `localhost:9000`
- **Playwright**：baseURL 是 `http://localhost:9100`，自动启动前端 dev server
- **数据库**：开发用 SQLite（`backend/data/panshi.db`），生产用 PostgreSQL
- **环境变量**：使用 `.env.development` 和 `.env.production`，不要提交真实密钥

## 代码约定

- **登录 input 必须保留 id 属性**：Playwright 测试依赖 `id="username"` 和 `id="password"`
- **中文本地化**：UI 文字使用内联中文，不使用 i18n 库
- **OpenSpec**：变更跟踪工具，归档在 `openspec/changes/archive/`

## 测试注意事项

- 后端测试在 `backend/tests/`，使用 pytest-asyncio
- E2E 测试在 `frontend/e2e/*.spec.ts`，需要前后端都运行
- Playwright 测试需要保留特定的 DOM id 选择器

## Git 注意事项

- `.gitignore` 排除：`.venv/`、`node_modules/`、`*.db`、`.env*`（除 `.env.example`）
- `uv.lock` 在 `.gitignore` 中，不应提交
- `package-lock.json` 未被忽略，可能因平台不同

## 快速检查清单

1. 修改产品名 → 确认是"磐石"不是"盘石"
2. 修改 UI → 确认 input 有 `id="username"` 和 `id="password"`
3. 新增依赖 → 更新 `pyproject.toml`（后端）或 `package.json`（前端）