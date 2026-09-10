# 磐石 Gateway 重构方案 v4（增量治理 · 八方向复核）

> 日期：2026-09-11 · 范围：`backend/app` + `frontend/src` · 证据基准：本轮全量增量侦察（git 历史核验 + grep 实证 + 源码抽读）
>
> **技术栈（按现状，非选项）**：前端 Vue 3（Composition API）+ TypeScript + **Ant Design Vue 4** + Pinia + Vue Router；后端 FastAPI + async SQLAlchemy 2.0 + Pydantic v2；构建 Vite / uv；测试 pytest + Vitest + Playwright。
>
> **前置说明（避免复读）**：用户提出的八个方向在 v1（`refactoring-plan-2026-08-29.md`，Phase 0–6 全落地）、v2（`refactoring-plan-2026-08-30.md`，7A/7B/7D 已提交）、v3（`refactoring-plan-2026-09-10.md`，8A/8B/8C-1 已提交）中**已被完整规划并执行**。本轮不再重复已落地项，只列经当前代码**重新验证**的真实剩余问题。

---

## 0. 执行摘要

**结论：代码库处于健康状态，八方向无大结构调整需求。** 本轮复核后仅剩：

| 级别 | 问题 | 证据 | 处置 |
|---|---|---|---|
| P2 | 生产代码残留 **1 处 `as any`**：`DatabaseManagement.vue:619` `migrateResult.value = data as any` | grep 实证（排除注释后仅此 1 处） | §2 R1 类型化修复 |
| P3 | `config/auditResourceRoutes.ts` **3 个 map 仅内部消费却 `export`**（`AUDIT_RESOURCE_LABELS` / `AUDIT_VERB_LABELS` / `AUDIT_RESOURCE_ROUTES`） | 全仓（含测试）0 外部引用 | §2 R2 收窄导出面 |
| — | 1 项产品决策（IA 双导航）、2 项评估（plugin_definitions YAML 化、虚拟滚动） | 见 §3 | 登记待决策，不擅自动代码 |

八方向逐项复核见 §1；不重复已落地项的执行记录见 v3 §11。

---

## 1. 八方向现状对照（本轮复核证据）

| 方向 | 状态 | 关键证据（可复核命令） |
|---|---|---|
| **① 函数合并/代码治理** | ✅ 达标 | `escapeHtml` 单实现 `utils/html.ts`（`grep -rn "function escapeHtml" frontend/src` = 1）；SSE 解析单实现 `utils/sse.ts`（`grep -rln "getReader()" frontend/src` 仅命中该文件）；CRUD 十件套工厂 `useClusterResourceCore.ts`（约定 #24）；发布/版本/回滚单实现（约定 #18） |
| **② 死代码删除** | ✅ 达标 | `NodeListResponse`/`ImportLogResponse` 全仓 0 引用；`except:` 裸捕获 = 0；`console.log` 生产代码 = 0；`TODO/FIXME/HACK` = 0；仅剩 3 个冗余 `export`（§2 R2） |
| **③ 前端界面优化** | ✅ 达标 | 弹窗三层制（约定 #25）、格式化单实现 `utils/format.ts`（约定 #26）、`usePagination`/`useDebouncedSearch`、`getApiErrorMessage` 全局错误提取、路由全懒加载 |
| **④ 架构优化** | ✅ 达标 | API 单实例 + 拦截器（`api/index.ts`）；Pinia 5 store；后端直连模式（约定 #3）；`useClusterUtils.ts` 单文件（R1 决策维持） |
| **⑤ 安全加固** | ✅ 达标 | 全部端点经 router 声明处或参数级 `Depends` 鉴权；守卫测试 `test_security_guard.py` 防回归（v3 8A 补 5 采样）；`admin_key` 仅存于**请求**模型（响应已脱敏，`schemas/cluster.py:61` 注释为证）；SSL 私钥掩码；`db_config.json` Fernet 加密（约定 #20） |
| **⑥ 性能优化** | ✅ 达标 | 路由全 `() => import()`；vite rolldown `advancedChunks` 分包；主要列表服务端分页；`Promise.all` 并发；`time.sleep` = 0 |
| **⑦ 工程化建设** | ✅ 达标 | ESLint 10 flat + Prettier + husky 9 + lint-staged（约定 #27）；测试资产：后端 103 / 前端单测 87 / E2E 32 文件；TypeScript 已全面使用 |
| **⑧ 可维护性提升** | ✅ 达标 | 全局异常处理（`main.py`）；配置驱动（`features.yaml` mtime 热重载 / `equivalence_rules.yaml` / `clickhouse.yaml` / `db_config.json`）；操作审计全覆盖（`core/audit_hook.py` + `GET /system/operations`）；版本回滚 `rollback_resource` 单实现 |

---

## 2. 本轮真实剩余项（可立即执行）

### R1 — `DatabaseManagement.vue:619` 生产 `as any` 消除

**证据**：`grep -rn "as any" frontend/src --include=*.ts --include=*.vue | grep -v 测试` 排除 2 处注释后仅剩此 1 处。

```ts
// frontend/src/views/DatabaseManagement.vue:618-619（现状）
onComplete: (data) => {
  migrateResult.value = data as any        // ← 类型逃逸
```

**判断依据**：类型定义已存在——`types/database.ts:124` 有 `MigrationCompleteEvent`，视图内 `:356` 已声明 `ref<MigrateResult | null>`。`as any` 只是因为 `onComplete` 回调参数未泛型收窄。

**修复策略**（行为零变更，纯类型）：

```ts
// onComplete 形参显式标注（或让 createSSEClient 泛型收窄到 MigrationStreamEvent）
onComplete: (data: MigrationCompleteEvent) => {
  migrateResult.value = data          // 若字段不完全对齐，改用具名映射函数而非断言
```

需先核对 `MigrationCompleteEvent` 与 `MigrateResult` 的字段差异（`tables`/`backup_path`/`message`），差异处写显式映射函数，禁止用断言掩盖。

### R2 — `config/auditResourceRoutes.ts` 冗余导出收窄

**证据**：`AUDIT_RESOURCE_LABELS` / `AUDIT_VERB_LABELS` / `AUDIT_RESOURCE_ROUTES` 三个 map 在全仓（含测试）**0 外部引用**，仅在同文件的 `auditActionLabel` / `auditResourceLabel` / `auditResourceLink` 内被读取。

**修复策略**：删除三个 map 的 `export` 关键字（保留文件内使用）。若意图是「对外暴露配置 API」，则应在 spec/文档登记消费方；当前无消费方即视为过度暴露的公共面。

> 保留 `export function auditActionLabel/auditResourceLabel/auditResourceLink`（视图层真实消费）。

### R3（可选，低收益）— 审计标签 map 结构合并

`auditResourceRoutes.ts` 现有 4 个数据结构（资源标签 / 动词标签 / 旧动作别名 / 资源路由）。当前 149 行、职责单一、会话可一次读完，**建议维持不合并**（符合约定 #11 判据：拆/合维度是「会话读取原子单位」）。仅登记观察。

---

## 3. 待决策 / 待观察（不擅自改代码）

| 项 | 现状 | 处置 |
|---|---|---|
| **IA 双导航并存** | 9 个顶层资源菜单 + 「集群统管」`/central-management` 卡片+Tab 两套 IA 并存（`router/index.ts`、`AppSidebar.vue`） | **产品决策项**：确认目标形态后另立 openspec 变更；本方案不动 |
| **`config/plugin_definitions.py`（1312 行）** | 插件 schema 以 Python 内嵌（类型被 import 校验） | 评估后缓做：YAML 化需引入运行时解析+校验层，当前无「不改代码加插件」需求 |
| **虚拟滚动** | 主要列表服务端分页，数据量未触发阈值 | >2k 行再评估 |
| **大文件观察** | `CentralList.vue` 2457 / `EdgeClient.vue` 2047 / `PluginEditorDrawer.vue` 1427 行 | 按约定 #11 判据维持；触发条件 = ~1500 行 + 零共享新职责 + 实际连读成本 |

---

## 4. 不做项台账（历轮延续，防止范围蔓延）

R1 `useClusterUtils.ts` 单文件不拆；R2 集群 Tab 工具栏缓做；R3 后端列表骨架不抽基类；R4 `.vue` 模板层 any 增量治理；
清单/自启动密码明文（用户决策，禁掩码，约定 #10）；JWT 维持 24h（可选生产 8h）；虚拟滚动 >2k 行再评估；
IA 双导航 = 待产品决策；`json.dumps/loads` 不引 TypeDecorator（触碰约定 #23 序列化怪癖）；
`plugin_definitions.py` 维持 Python 内嵌。

---

## 5. 风险点与测试建议

**风险点**

1. **R1 纯类型改动**：核对 `MigrationCompleteEvent` 与 `MigrateResult` 字段后再改，差异处写显式映射而非新断言——避免「为消 `as any` 而引入更隐蔽的类型谎言」。
2. **R2 仅删 `export` 关键字**：零运行时影响；但若未来有跨文件复用需求，需重新导出（成本极低）。
3. **勿触碰 v3 已收敛项**：`utils/html.ts`、`utils/sse.ts` 是单实现，任何「再抽象」都会重新引入分叉风险。

**测试建议**

| 改动 | 验证命令 |
|---|---|
| R1 | `cd frontend && npx vue-tsc --noEmit`（0 错误）+ 数据库迁移相关 vitest 定向用例 |
| R2 | `cd frontend && npx vue-tsc --noEmit` + `npx vitest run src/config/__tests__/auditResourceRoutes.test.ts`（20 例） |
| 全量基线 | `cd backend && uv run pytest`（基线 1503 passed / 12 skipped）+ `cd frontend && npx vitest run`（基线 830+） |

> 测试基线提示：vitest 全量并行运行时个别 `renders page header` 用例存在环境性超时抖动（隔离复跑全过），勿误判为新回归。

---

## 6. 执行记录（2026-09-11）

| 项 | 状态 | 验证 |
|---|---|---|
| R1 `as any` 消除 | ✅ 已执行 | `MigrationCompleteEvent` 补 `message` 字段；`api/database.ts` 内联匿名回调类型替换为具名事件类型；`DatabaseManagement.vue` 显式映射替代断言 → 生产代码 `as any` = 0；`vue-tsc` 0 错误；database 相关 vitest 21/21 |
| R2 冗余导出收窄 | ✅ 已执行 | 3 个内部 map 去 `export`；`vue-tsc` 0 错误；`auditResourceRoutes` 20/20 |
| R3 审计 map 合并 | 登记不执行 | — |
| §3 待决策项 | 登记不执行 | — |
