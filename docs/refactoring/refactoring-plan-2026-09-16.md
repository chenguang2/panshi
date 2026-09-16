# 磐石 Gateway 重构方案 v5（增量复核 · 八方向再验证）

> 日期：2026-09-16 · 范围：`backend/app` + `frontend/src` · 性质：**增量复核**，非重新规划
>
> **技术栈（按现状，非选项）**：前端 Vue 3（Composition API）+ TypeScript + Ant Design Vue 4 + Pinia + Vue Router + Vite；后端 FastAPI + async SQLAlchemy 2.0 + Pydantic v2；测试 pytest + Vitest + Playwright。
>
> **前置说明（避免复读）**：用户提出的八个重构方向已在 v1（`refactoring-plan-2026-08-29.md`，Phase 0–6 全落地）、v2（`refactoring-plan-2026-08-30.md`，7A/7B/7D）、v3（`refactoring-plan-2026-09-10.md`，8A/8B/8C-1）、v4（`refactoring-plan-2026-09-11.md`，八方向复核 + R1/R2 落地）中**完整规划并执行**。本轮是对 v4 结论的**独立再验证**（间隔 5 天、期间有多次提交），只登记真实变化与仍待决策项，不重复已落地内容。

---

## 0. 执行摘要

**结论：无漂移，无需新增大结构调整。** 本轮以 v4 的证据命令逐条复跑，v4 声称的达标项全部仍然成立；八方向中唯一"非代码"的停滞项仍是 v4 §3 登记的三项待决策/待观察（产品决策 + 阈值未达）。

| 级别 | 项 | 本轮实测 | 处置 |
|---|---|---|---|
| — | v4 R1 生产 `as any` = 0 | 复跑：`as any` 命中 2 处**均为注释文本**（`UserList.vue:9` 任务清单、`types/database.ts:92` 设计说明），代码级 = 0 | 维持，无需动作 |
| — | v4 R2 冗余导出收窄 | 复跑：三个 map 均为未导出 `const`（`auditResourceRoutes.ts:7/45/144`） | 维持 |
| P3 | 期间新增治理项（本会话已顺手清理） | 见 §1 ② 与 §3 | 已提交 |

---

## 1. 八方向逐项再验证（2026-09-16 实测证据）

| 方向 | 状态 | 本轮复跑证据 |
|---|---|---|
| **① 函数合并/代码治理** | ✅ 维持 | `escapeHtml` 定义数 = 1（`utils/html.ts`）；`getReader()` 仅 1 个文件（`utils/sse.ts`）；视图层本地 `formatDate` 定义 = 0（统一走 `utils/format.ts`）；CRUD 十件套工厂 / 发布-版本-回滚单实现（约定 #18/#24） |
| **② 死代码删除** | ✅ 维持 + 本期增量 | 生产 `console.log` = 0；`TODO/FIXME/XXX` = 0；`@ts-ignore/@ts-expect-error` = 0；裸 `except:` = 0；`Modal.confirm` 实际调用 = 0（命中 2 处均为注释/CSS 注释）；**本期新增清理见 §3** |
| **③ 前端界面优化** | ✅ 维持（无新目标页面） | 弹窗三层制、`usePagination`/`useDebouncedSearch`、`getApiErrorMessage` 全局错误提取、路由全懒加载（`() => import()` 30 处） |
| **④ 架构优化** | ✅ 维持 | API 单实例 + 请求/响应拦截器（`api/index.ts:14/27`）；后端直连模式；`useClusterUtils.ts` 维持单文件（R1 决策） |
| **⑤ 安全加固** | ✅ 维持 | 全部端点经 router 声明处或参数级 `Depends` 鉴权；守卫测试 `tests/test_security_guard.py` 在位（`UNAUTHENTICATED_SAMPLES` 参数化覆盖）；响应侧 `admin_key`/SSL 私钥脱敏；`db_config.json` Fernet 加密 |
| **⑥ 性能优化** | ✅ 维持 | 路由懒加载 30 处；视图分页配置 14 个；`time.sleep` = 0；虚拟滚动使用 0 处（**阈值未达，非缺陷**） |
| **⑦ 工程化建设** | ✅ 维持 | ESLint 10 flat + Prettier + husky 9 + lint-staged；TypeScript 全覆盖；后端全量 **1577 passed / 3 failed**（3 项经 `git stash` 复现确认为预存在：2 个证书时钟相关 + 1 个路由数据依赖） |
| **⑧ 可维护性提升** | ✅ 维持 | 全局异常处理（`main.py`）；配置驱动：`features.yaml` 热重载（15 处引用）、`equivalence_rules.yaml`、`clickhouse.yaml`、`db_config.json`；审计全覆盖 + `GET /system/operations`；配置版本回滚单实现 |

---

## 2. 八方向中「有意不适用」的条目（防误改）

用户的通用简报含若干与本仓库既定决策冲突的条目，**登记为不适用**，避免后续会话误执行：

| 简报条目 | 本仓库事实 | 依据 |
|---|---|---|
| 「敏感配置信息（密钥、密码等）做脱敏展示」 | **清单/自启动的 SSH 密码禁止任何掩码**（明文返回）；仅 SSL 私钥、`admin_key` 等做脱敏 | 约定 #10：2026-08 掩码占位曾被写回清单文件、真实密码不可恢复，两模块功能全挂 |
| 「统一命名规范」→ 重命名历史字段 | 字段名错位仅 2 处且已按 mapper 读列名（`SslCertificate.private_key`→列 `key`、`StreamProxy.timeout` 为 TEXT） | 约定 #23：按列名序列化，禁止为"统一"而改列名 |
| 「对臃肿模块进行拆分与解耦」→ 拆所有大文件 | 拆分判据是**会话读取原子单位**，非行数：须同时满足 ~1500 行 + 出现零共享代码的新职责 + 实际发生连读 3+ 文件才拆 | 约定 #11/#24；`useClusterUtils.ts`、`plugin_definitions.py` 明确维持 |
| 「引入 TypeScript 的可行性」 | 早已全面 TS | 简报占位符（`[Vue/React/Angular]`、`[Element UI/...]`）未替换，实际栈见文首 |
| 「统一 ESLint + Prettier + husky + lint-staged」 | 已配置并在用 | 约定 #27 |

---

## 3. 本期（09-12 → 09-16）真实变更与新增治理

| 项 | 内容 | 影响 |
|---|---|---|
| 迁移收尾重构 | SSE 生成器的收尾（等线程/清锁/写历史）迁至独立任务 `_finalize_migration` | **架构**：修复"刷新页面 → 锁永久卡死 + 历史记录丢失"；约定 #33 |
| 同步迁移端点下线 | `POST /database/migrate` 移除（前端零调用） | **死代码 + 架构**：消除"事件循环被迁移阻塞、全站无响应"隐患；约定 #31 |
| API 404 兜底 | `main.py` 增 `/api/{rest:path}` JSON 404 | **可维护性/安全面**：未知 API 路径不再返回 200+HTML；**当场暴露 2 个假通过测试**（调用不存在的 `/api/v1/users`） |
| 前端死代码清理 | `migrateDatabase()`、`MigratePayload` 类型、`DatabaseManagement.vue` 死导入、相关单测/mock | **死代码**：全仓 0 引用（含测试） |
| 后端死代码清理 | `inventory_service.py` 的 `_CRED_KEYS`（掩码机制移除后的残留常量，0 引用） | **死代码**：清单 60 个相关测试通过 |
| 规则收敛 | 55 条本机记忆 → 全部落地 `AGENTS.md` 关键约定 #31–45 后归档 | **可维护性**：单一事实源；消除文档↔记忆漂移（曾发生 #36 与 #10 矛盾） |

---

## 4. 待决策 / 待观察（v4 §3 延续，本轮无变化，**不擅自改代码**）

| 项 | 现状（2026-09-16 实测） | 触发条件 / 处置 |
|---|---|---|
| **IA 双导航并存** | 9 个顶层资源菜单 与 「集群统管」`/central-management`（卡片+Tab）两套 IA 并存（路由/Sidebar 3 处引用） | **产品决策项**：明确目标形态后另立 openspec 变更 |
| **`plugin_definitions.py` YAML 化** | 1312 行，插件 schema Python 内嵌（类型被 import 校验） | 需引入运行时解析 + 校验层；当前无"不改代码加插件"需求 → 缓做 |
| **虚拟滚动** | 视图使用 0 处；主要列表为服务端分页 | 单页 >2k 行再评估 |
| **大文件观察** | `CentralList.vue` 2457 / `NodeTaskCenter.vue` 2286 / `EdgeClient.vue` 2047 行 | 按约定 #11 判据维持，触发条件见上 |

---

## 5. 不做项台账（历轮延续，防止范围蔓延）

`useClusterUtils.ts` 单文件不拆；集群 Tab 工具栏缓做；后端列表骨架不抽基类；`.vue` 模板层 any 增量治理；
清单/自启动密码明文（用户决策，禁掩码）；JWT 维持 24h（可选生产 8h）；虚拟滚动 >2k 行再评估；
IA 双导航 = 待产品决策；`json.dumps/loads` 不引 TypeDecorator；`plugin_definitions.py` 维持 Python 内嵌。

---

## 6. 若需继续治理：三个真增量方向（非复读）

1. **静态分析深挖**（v1–v4 未做过）：全量未使用导出扫描（`ts-prune`/`knip` 类）、跨文件近似重复代码块检测、后端未引用模块扫描 —— 产出可复核的死代码清单。
2. **前端体验专项**：需用户指定目标页面（如 NodeTaskCenter 2286 行），由 design 视角做信息层级/操作路径前后对比与实施。
3. **测试盲区测绘**：E2E 32 文件与路由/端点总量的覆盖差集，识别关键路径缺口（如迁移断连场景此前无 E2E，仅单测覆盖）。

> 三者都应立 openspec 变更并按 TDD 推进（约定 #16），而非"全局重构"一次性铺开。

---

## 7. 风险点与测试建议

**风险点**

1. 本方案不产生代码改动，风险为"误把待决策项当任务执行"——§4 四项须先取得决策。
2. 任何触碰 `utils/html.ts`、`utils/sse.ts`、`useClusterUtils.ts`、`plugin_definitions.py` 的"再抽象"都会重新引入分叉/回归风险（前两者为 v3 收敛的单实现）。
3. 若做静态分析清理，须逐项给出判断依据（全仓引用核验），禁止凭"看起来没用"删除。

**测试建议**

| 场景 | 命令 |
|---|---|
| 后端基线 | `cd backend && uv run pytest`（本期实测 1577 passed / 3 预存在失败） |
| 前端类型 | `cd frontend && npx vue-tsc --noEmit`（0 错误） |
| 前端单测 | `cd frontend && npx vitest run`（并行时个别 `renders page header` 有用例性抖动，隔离复跑全过） |
| 迁移相关 | `cd backend && uv run pytest tests/test_migration_stream_api.py tests/test_security_guard.py` |
