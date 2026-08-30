# 磐石 Gateway — AI 代理指南

> **元规则**：本文件与代码冲突时，以代码为准，并同步修正本文档相应条目。

## 领域模型

磐石 Gateway 是多集群 Edge 网关（OpenResty）统一管理平台。新功能先定位到对应域，再按命名约定落位：

- **集群配置域**：集群 / 路由 / 上游 / 插件 / SSL 证书 / 节点 / DNS 代理 / 流代理 / 全局规则，配置发布推送到 Edge 节点
- **自动化域**：Ansible 主机清单与自动化部署（OpenResty 安装、节点任务执行）
- **观测域**：指标采集（ClickHouse）、仪表盘、健康统计
- **运维域**：Edge 节点直连与数据导入、集群备份/恢复/导出（JSON/Excel）、数据库管理、用户与认证

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI + async SQLAlchemy 2.0 + Pydantic v2 |
| 认证 | JWT（python-jose）+ bcrypt |
| 自动化 | ansible-runner / ansible-core |
| 指标 | clickhouse-driver |
| Excel 导出 | openpyxl |
| 前端 | Vue 3（Composition API）+ TypeScript + Ant Design Vue 4 + Pinia + Vue Router |
| 前端可视化/编辑器 | ECharts、Monaco Editor、json-editor-vue |
| 构建 | Vite（前端）/ uv（后端 Python） |
| 测试 | pytest + pytest-asyncio（后端）；Vitest（单元）+ Playwright（E2E）（前端） |
| 数据库 | SQLite（开发，`backend/data/`） |

## 常用命令

```bash
# 📌 开发启动（一键启动前后端）
develop/linux/start.sh                # 后端 → 12344，前端 → 12345
develop/linux/stop.sh                 # 停止

# 后端测试
cd backend && uv run pytest

# 前端 E2E 测试
cd frontend && npx playwright test

# 前端单元测试
cd frontend && npx vitest run

# 前端构建
cd frontend && npm run build

# 默认登录
# admin / panshi123 访问 http://localhost:12345
```

## 端口

| 服务 | 端口 | 说明 |
|---|---|---|
| 后端 | 12344 | `develop/linux/start.sh` 指定 |
| 前端 | 12345 | start.sh 指定 |

Vite 代理将 `/api` 请求转发到 `localhost:12344`（读取 `backend/.port` 文件，缺省 12344）。

## 国内网络环境（重要约定）

**本机位于中国网络环境，下载任何国外软件包/依赖/二进制文件必须优先使用国内镜像源，否则极慢或超时。** 每次安装/下载前先检查是否可换用国内源：

| 场景 | 国内源配置 |
|---|---|
| npm 包安装 | `npm config set registry https://registry.npmmirror.com`（或 `--registry=` 单次指定） |
| pip / uv 包安装 | `uv pip install --index-url https://pypi.tuna.tsinghua.edu.cn/simple` 或 `pip config set global.index-url` |
| **Playwright 浏览器下载** | `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium`（或 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`） |
| apt 系统包 | 使用清华/阿里源（如 `mirrors.tuna.tsinghua.edu.cn`、`mirrors.aliyun.com`） |
| GitHub 下载（releases/源码） | 使用 `https://ghproxy.com/` 或 `https://mirror.ghproxy.com/` 前缀代理，或 `https://hub.fastgit.org` |
| Maven / Go / Rust 等 | 分别用阿里云 Maven、`GOPROXY=https://goproxy.cn`、`https://rsproxy.cn`（crates.io 镜像） |

**注意**：
- 不要默认直连 `registry.npmjs.org`、`pypi.org`、`playwright.azureedge.net` 等国外源
- Playwright 安装浏览器时若卡住，先 `Ctrl+C` 中断，改用 `PLAYWRIGHT_DOWNLOAD_HOST` 国内镜像重试
- 环境变量可在命令前内联设置（临时生效），无需修改全局配置

## 项目结构

目录树只列稳定骨架；具体文件用 glob 查看，不要依赖枚举。

```
backend/
  app/
    api/v1/      # REST 路由。命名约定：cluster_*.py = 集群域资源（路由/上游/节点/SSL/插件等，
                 #   按资源一文件）；无 cluster_ 前缀 = 全局/平台级（auth、users、ansible_inventory、
                 #   metrics、database、nodes、edge_client、edge_import、system 等）
    core/        # 数据库引擎、安全配置、seed（默认账号）
    models/      # SQLAlchemy ORM 模型
    schemas/     # Pydantic 请求/响应结构
    services/    # 复杂业务逻辑（ansible_service、inventory_service、metrics_service、
                 #   clickhouse_client、cluster_backup、db_archive/migration/switch 等）
    config/      # YAML 配置（equivalence_rules.yaml 字段等价规则、clickhouse.yaml）
    utils/
  tests/         # pytest 测试
  data/          # SQLite 数据库与运行时数据（全部不入库）
frontend/
  src/
    api/         # Axios 客户端，按资源拆分模块（ansibleInventory.ts、ssl.ts、streamProxy.ts 等）
    components/  # 通用组件（PluginEditorDrawer.vue 插件双模式编辑器、VersionManagementModal.vue 等）
    views/       # 页面级组件；views/clusters/ = 集群子页 Tab
    composables/ # useCluster*.ts 可复用 CRUD 逻辑；useClusterUtils.ts = 共享发布/删除工具
    router/      # Vue Router
    stores/      # Pinia
    types/  assets/  styles/  utils/
  e2e/           # Playwright spec（在 frontend/e2e/，不在 src 下）
deployment/      # systemd 服务文件
develop/linux/   # 开发启动/停止脚本
develop/windows/ # Windows 版（PowerShell）
docs/            # 设计文档、Edge API 参考（docs/edge/*.log 为 API 示例）；docs/refactoring/ = 重构治理文档（见约定 #12）
openspec/        # 变更工件；openspec/specs/ = main specs
.opencode/skills/  .opencode/command/   # AI 工具配置
```

## 关键约定

1. **登录输入框必须保留 `id` 属性** — Playwright 测试依赖 `#username` 和 `#password` 选择器（`frontend/src/views/Login.vue`），切勿删除或改名。
2. **后端入口为 `app.main:app`** — 不是根目录的 `main:app`。
3. **数据访问直连模式** — 简单 CRUD 直接在 route handler 中用 SQLAlchemy 执行（`select()` / `execute()`），不建 Repository 层；仅复杂业务逻辑（Ansible、备份、指标等）放 `services/`。`backend/app/repositories/` 已不存在，不要重建。
4. **插件编辑器支持双模式** — 表单编辑和 JSON 编辑都支持（`PluginEditorDrawer.vue`），不可移除任一模式。
5. **代码禁止 `as any`、`@ts-ignore`、`@ts-expect-error`** — 生产代码已清零（存量 74 处已于 2026-08 清理）；测试文件（`__tests__/`、`*.test.ts`、`*.spec.ts`）豁免，mock 场景允许。
6. **前端 API 按资源拆分模块** — 新资源在 `frontend/src/api/` 建对应 `.ts` 模块，不要往单文件里堆。
7. **发布/删除流程统一** — 使用 `useClusterUtils.ts` 中的 `executePublish` 和 `executeDeleteWithProgress` 共享函数，不要在 composable 中重复实现进度弹窗逻辑。
8. **测试运行时服务已启动** — 开发环境前后端（后端 12344 / 前端 12345）默认已在运行，不要自行启动/停止。验证链路直接连 `http://localhost:12345`（前端）与 `http://localhost:12344`（后端）。仅当 curl 健康检查失败时才用 `develop/linux/start.sh` 启动、`develop/linux/stop.sh` 停止。手动链路测试（Playwright）优先复用已运行实例，完成后不停止系统。
9. **界面语言为中文内联文本** — 所有 UI 文案直接写中文，不引入 i18n 库。
10. **清单与自启动模块禁止密码脱敏** — Ansible 主机清单（`GET /inventory`、`POST /inventory/parse`）与自启动管理（走 `get_ssh_password` 读清单文件）依赖真实 SSH 密码，**不得对 `ansible_ssh_pass`/`ansible_become_pass` 做任何掩码/脱敏**。历史教训（2026-08）：Phase 6 曾给 parse 加掩码，`******` 占位被表格模式保存时**写回 inventory/host 文件本体**，真实密码被覆盖且不可恢复，两个模块功能全挂；已在 commit c88aa26 彻底移除该机制。清单密码明文返回（前端 `a-input-password` 展示），真实密码备份在 `backend/ansible/inventory/backups/`。
11. **`useClusterUtils.ts` 维持单文件、禁止按职责拆分** — 承 #7：它是发布/删除/批量弹窗的单一实现，其价值在于单点可发现性（LLM 一次 read 即得完整上下文），拆成多文件反而增加漏读与间接层成本（它是 Phase 4 合并产物）。本仓库主要由 LLM 维护，文件切分维度是"会话读取的原子单位"而非"职责哲学分类"——任何"大文件=坏味道"的重构直觉先按此判据复核。重启拆分的触发条件见 `docs/refactoring/refactoring-plan-2026-08-30.md` R1 决策记录（突破 ~1500 行 / 出现零共享代码的新职责 / 实际发生连读 3+ 文件才敢下笔的定位成本）。
12. **重构治理文档统一放 `docs/refactoring/`** — 重构方案（`refactoring-plan-*.md`）、代码评审报告（`code-review-report*.md`）等治理类文档一律写入该目录，**不得散落在 `docs/` 根**（根目录只留 user-manual、architecture 等长期文档）。新会话产出重构计划前先确认此归属。

## 新增功能步骤

1. 在 `backend/app/schemas/` 定义 Pydantic 模型
2. 在 `backend/app/models/` 定义 SQLAlchemy 模型
3. 在 `backend/app/api/v1/` 添加路由（集群域资源用 `cluster_` 前缀；仅复杂逻辑才加 `services/`）
4. 在 `frontend/src/api/` 添加资源模块，再按需加 composable 和页面

## Git 规则

以 `.gitignore` 为唯一事实源，提交前先 `git status` 确认。要点：

**不入库**（已由 .gitignore 覆盖，不要 force-add）：
- `backend/data/` 全部内容（数据库、静态资源、归档）— 没有任何 .db 文件被跟踪
- `uv.lock`（`backend/uv.lock` 为历史遗留的已跟踪文件；新 lock 文件不提交）
- `logs/`、`*.png`、`product/`、`docs/other/`、`test-results/`
- `backend/ansible/soft/`、`backend/ansible/collections/`、`backend/bin/`
- AI 工具缓存：`.playwright-mcp/`、`.history/`、`.omo/`、`.sisyphus/`、`.cortexkit/`
- 运行时输出：`backend/uvicorn.err|out`、`session-*.md`、`backend/data/static/`、`backend/data/archives/`

**继续正常提交**：
- `openspec/`（全部变更工件）
- `docs/edge/*.log`（既有 API 示例文件）
- `.opencode/skills/` 和 `.opencode/command/`（AI 工具配置）

**依赖声明**：新增后端依赖 → `backend/pyproject.toml`（不是 requirements.txt）；新增前端依赖 → `frontend/package.json`。

## 快速检查清单

- [ ] 验证链路直接连 localhost:12344/12345，勿自行启停服务（服务常驻）
- [ ] 登录表单包含 `id="username"` 和 `id="password"`
- [ ] 代码无 `as any` / `@ts-ignore` / `@ts-expect-error`（测试文件豁免）
- [ ] 依赖写入正确的 manifest（pyproject.toml / package.json）
- [ ] 提交前 `git status` 确认，不 force-add 忽略文件（尤其 `backend/data/`）
- [ ] 本文件与代码冲突时，已按代码修正本文件
