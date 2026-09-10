# 磐石 Gateway 重构方案 v3（增量治理）

> 日期：2026-09-10 · 范围：backend/app + frontend/src · 证据基准：本次全量增量侦察（grep + 源码核验 + **运行中服务匿名 curl 实测**）
>
> **前置说明**：v1 方案（`refactoring-plan-2026-08-29.md`）八方向已全部落地（Phase 0–6）；
> v2 方案（`refactoring-plan-2026-08-30.md`）7A 死代码 / 7B 安全 / 7D 分包已提交，7C（useClusterUtils 拆分）经讨论取消（R1 决策）。
> 本文档不重复已落地项，只列经当前代码**重新验证**的真实剩余问题。技术栈按现状陈述：Vue 3 + TypeScript + Ant Design Vue 4 + Pinia（前端）/ FastAPI + async SQLAlchemy 2.0（后端）。

---

## 0. 执行摘要

代码库经两轮治理后整体健康：前端 62.6k 行 / 后端 23.8k 行；测试资产后端 103 文件、前端单测 79 文件、E2E 32 spec。
本轮排查发现 **1 个 P0 安全缺口**（clusters.py 5 个端点完全无鉴权，且守卫测试采样恰好绕开）、
**1 处生产代码 `as any` 回归**、**2 组重复实现待收敛**（escapeHtml ×2、SSE 流解析 ×4）、**2 个死 Pydantic 模型**、
**1 处 `clusters.admin_key` 随列表接口明文序列化**。无 P0 性能问题、无新的大结构调整需求。

| 级别 | 问题 | 证据 | 处置 |
|---|---|---|---|
| **P0** | `clusters.py` 5 端点无鉴权（list/get/stats/test/sync），匿名可读全量集群并触发连通测试/同步动作 | curl 实测 `GET /api/v1/clusters` → **200**；源码 `clusters.py:69,164,197,364,406` 无 `Depends` | 8A 修复 + 守卫测试补样 |
| **P0** | `ClusterResponse.admin_key`（Edge Admin API 密钥）随列表/详情序列化返回，一旦配置即随匿名 200 泄漏 | 实测响应含 `"admin_key":null` 字段位；`schemas/cluster.py:61` | 8A 响应脱敏（备份服务已有同款先例 `_serialize_without`） |
| P1 | `api/database.ts:89,92,98` 三处 `as any`（生产脚本层已清零约定的回归） | grep 实证 | 8B 泛型化修复 |
| P1 | `escapeHtml` 双实现且强度不一：`utils/ansi.ts:45`（5 实体）vs `utils/tools/diff.ts:166`（4 实体，**缺 `'`**） | grep + 源码比对 | 8B 收敛单实现 |
| P2 | SSE 流式解析 4 处独立实现：`utils/sse.ts`（仅 database.ts 用）、`api/edgeEnv.ts`、`views/NodeTaskCenter.vue`、`composables/useInstallStream.ts` 各自 `fetch+getReader` 循环 | `getReader()` grep | 8B 收敛到 `utils/sse.ts` |
| P2 | 死 Pydantic 模型 2 个：`NodeListResponse`、`ImportLogResponse`（全仓含测试 0 引用） | 精确 grep 复核 | 8B 删除 |
| P2 | `schemas/route.py:70,83` 两处 bare `except:` | grep 实证 | 8B 收窄异常类型 |
| P3 | 前端 6+ 视图绕过 `api/` 模块直连 axios（UserList ×10、EdgeAutostart ×4、四个全局列表视图等） | grep `api.get('/...')` | 8C 增量迁移 |
| P3 | 侧边栏双导航并存：9 个顶层资源菜单（/clusters /nodes /upstreams…）+ 「集群统管」(/central-management 卡片+Tab) | `AppSidebar.vue:150-300` + `router/index.ts:132-189` | 8C 产品决策项，不擅自删 |
| P3 | AGENTS.md 约定 #19 表述与实际不符：实际大量鉴权在**函数参数**处而非 `APIRouter()` 声明处 | 本轮逐文件核验 | 8A 顺带修订文档 |

---

## 1. 方向五前置：安全加固 P0（第一优先，Phase 8A）

### S-1 `clusters.py` 5 个匿名端点

**证据（逐端点源码核验 + 运行中服务 curl 实测）**：

| 端点 | 位置 | 匿名实测 | 风险 |
|---|---|---|---|
| `GET /api/v1/clusters` | `clusters.py:69` `list_clusters` | **200**（返回 total/items 全量） | 匿名枚举全部集群名称、描述、节点/上游/路由计数；且绕过非管理员「我的集群」（`/clusters/my` + `sys_user_cluster`）可见性模型 |
| `GET /api/v1/clusters/{id}` | `clusters.py:164` `get_cluster` | 401 未测但同文件同模式（无 Depends） | 匿名单集群详情 |
| `GET /api/v1/clusters/{id}/stats` | `clusters.py:197` `get_cluster_stats` | 同上 | 匿名健康统计 |
| `POST /api/v1/clusters/{id}/test` | `clusters.py:364` `test_connection` | —（代码无鉴权） | **匿名触发**后端→Edge 节点的连通性测试（可被用作探测内网/放大请求） |
| `POST /api/v1/clusters/{id}/sync` | `clusters.py:406` `sync_cluster` | —（代码无鉴权） | **匿名触发**集群同步动作（未授权写操作入口） |

**为何 v1 守卫测试没拦住**：`test_security_guard.py` 的 `UNAUTHENTICATED_SAMPLES` 采样的是
`/api/v1/clusters/1/routes` 等 `cluster_*` 子资源文件（均已在 8 月补齐鉴权），恰好没有采样 `/api/v1/clusters` 根路径本身。
数据库管理 `/database/*` 全部带 `require_db_admin`（逐端点核验 ✓）；`/api/v1/database/config` 匿名 200 是 **SPA 静态兜底返回的 index.html**，非真实端点，无泄漏。

**修复（TDD：先 RED 后 GREEN）**：

Step 1 — 守卫测试补采样（先跑，确认新样例失败）：

```python
# backend/tests/test_security_guard.py — UNAUTHENTICATED_SAMPLES 追加
    ("get", "/api/v1/clusters"),
    ("get", "/api/v1/clusters/1"),
    ("get", "/api/v1/clusters/1/stats"),
    ("post", "/api/v1/clusters/1/test"),
    ("post", "/api/v1/clusters/1/sync"),
```

POST 样例安全：断言 401 发生在鉴权依赖层，不会触达 handler 产生副作用。

```bash
cd backend && uv run pytest tests/test_security_guard.py -q   # 预期：新增 5 例 FAIL（RED）
```

Step 2 — 5 处端点补鉴权（与其余文件一致，参数级注入）：

```python
# clusters.py — 每个无鉴权端点签名追加一行（以 list_clusters 为例，其余 4 处同款）
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission('clusters')),  # 新增
```

```bash
cd backend && uv run pytest tests/test_security_guard.py -q   # 预期：全量 PASS（GREEN）
```

### S-2 `admin_key` 响应脱敏

`ClusterResponse.admin_key`（`schemas/cluster.py:61`）把 Edge Admin API 密钥回传浏览器；`ClusterFormModal.vue:114` 编辑时还回填明文。
集群备份服务已有同款先例（`cluster_backup.py:96` `_serialize_without(cluster, ("admin_key",))`），列表/详情接口照此办理：

- `ClusterResponse` 删除 `admin_key` 字段；
- `ClusterFormModal.vue` 编辑回填改为留空 + placeholder「留空保持原密钥不变」；
- 核验 `update_cluster`：`ClusterUpdate` 中 `admin_key` 为 `Optional` 且未传时不覆盖（改前先读 `clusters.py:170-196` 确认赋值方式，若为 `setattr` 全量更新需改为字段级 `exclude_unset` 判断）。

> 约定 #10（清单/自启动密码禁止脱敏）**不适用**于本项——那是Ansible 清单文件本体密码，此处是 API 响应序列化，两者机制不同。

### S-3 文档修订（元规则要求）

AGENTS.md 约定 #19「全部 API 路由在 `APIRouter()` 声明处 `dependencies=[Depends(get_current_user)]`」与实际不符：
实际有两种形态——router 声明处（`cluster_*.py` 等 20 文件）与函数参数级 `Depends(require_permission(...))`（`ansible_inventory.py`、`database.py`、`cluster_backup.py`、`cluster_export.py`、修复后的 `clusters.py`）。
按「本文件与代码冲突时以代码为准」修订该条为：**「全部 API 端点必须经 router 声明处或端点参数级 Depends 挂鉴权/权限依赖；守卫测试 `test_security_guard.py` 防回归，新增路由文件须同步补采样」**。

### 达标项（本轮复核，维持现状）

401 拦截器（`api/index.ts:32`，排除 /auth/login）、路由守卫（`router/index.ts:203-215` token + meta.permission）、
侧边栏 feature+permission 双门控（`AppSidebar.vue` passFeature/passPermission）、
`require_permission/require_any_permission/require_db_admin` 资源门控、SSL 私钥抽屉掩码、`db_config.json` Fernet 加密、
v-html 15 处全部走 escapeHtml/白名单构建路径（含 v2 已修的 PluginSwitches）、JWT 密钥解析链（约定 #20）。
S2（JWT 24h 无续期）维持 v2 评估结论：内网系统维持现状，可选生产 `.env` 配 8h，不立项。

---

## 2. 方向一：函数合并与代码治理（Phase 8B）

| # | 重复项 | 现状证据 | 合并策略 |
|---|---|---|---|
| M1 | `escapeHtml` ×2 | `utils/ansi.ts:45`（转义 `& < > " '` 5 实体）vs `utils/tools/diff.ts:166`（4 实体，**漏 `'`**，diff 渲染场景属性注入面） | 新建 `utils/html.ts` 单实现（取 5 实体强版），ansi.ts / diff.ts 改为 re-export；调用方零改动（沿用仓库 `VersionModalState` 单定义+重导出惯例） |
| M2 | SSE 流解析 ×4 | `utils/sse.ts`（POST + Bearer，仅 `api/database.ts` 消费）；`api/edgeEnv.ts`、`views/NodeTaskCenter.vue`、`composables/useInstallStream.ts` 各自手写 `fetch+getReader+buffer 切分` 循环（日志型长连接，含 GET 流） | `utils/sse.ts` 抽公共 `parseSSEStream(response, onEvent)`，新增 GET 型 `createSSEReader()`；三处迁移（关键代码见 §4） |
| M3 | 前端视图绕过 api 模块 | `UserList.vue`（/admin/users ×10）、`EdgeAutostart.vue`（/nodes ×4）、`PluginConfigList.vue` `/plugin_configs`、`GlobalRuleList.vue` `/global_rules`、`UpstreamList.vue` `/upstreams`、`PluginMetadataList.vue` `/plugin_metadata` 直连 axios；而 `api/nodes.ts` 等模块已存在却未被这些视图复用 | 增量迁移：每视图一次 commit，函数体一行改转发（`api/` 模块缺函数则先补模块）；不改任何 URL 与参数 |
| M4 | `as any` 回归 | `api/database.ts:89,92,98`（SSE event 经 switch 收窄后仍 `as any` 传给具体回调） | `createSSEClient` 泛型化（见 §4 代码），类型自然收窄，删除 3 处断言 |

**维持决策（不再重复提案）**：后端 11 个 `cluster_*.py` 列表骨架不抽通用分页基类（v2 R3：违反约定 #3 直连模式，单文件无逐字复制块）；`json.dumps/loads` 散布不引 TypeDecorator（触碰约定 #23 序列化怪癖：SslCertificate 列名错位、StreamProxy.timeout TEXT，风险 > 收益）；`useClusterUtils.ts` 不拆（v2 R1，触发条件见原文档）；`.vue` 模板层 ~474 处 any warn 维持增量（v2 R4）。

---

## 3. 方向二：死代码删除清单及判断依据（Phase 8B）

| # | 目标 | 判断依据（可复核） | 处置 |
|---|---|---|---|
| D1 | `backend/app/schemas/cluster.py` `NodeListResponse` | 全仓（app+tests）grep `NodeListResponse`：仅定义行，0 引用。节点列表端点实际返回 `dict`（`nodes.py:20` `response_model=dict`） | 删类 |
| D2 | `backend/app/schemas/edge_import.py` `ImportLogResponse` | 全仓 grep 仅定义行 0 引用（迁移日志实际由 `record_migration_log` 直写库） | 删类 |
| D3 | `backend/app/schemas/route.py:70,83` bare `except:` | 两处包裹 `json.loads` 的解析兜底，捕获范围过宽（连 KeyboardInterrupt 都吞） | 收窄为 `except (ValueError, TypeError):`（JSONDecodeError 是 ValueError 子类），行为不变、语义精确 |

**防误删反例（本轮专门排除的假阳性）**：`ClusterBase/UpstreamBase/StreamProxyBase/UserBase` 是 Pydantic 继承基类（同文件被子类引用，存活）；
`PluginPreview/ImportSelection/ConflictInfo` 等 edge_import 模型各有 1–3 处真实引用（存活）；
旧版顶层视图 `UpstreamList/RouteList/PluginConfigList/GlobalRuleList/PluginMetadataList/StaticResourceList/NodeList` 均在 `router/index.ts:149-189` 注册且被侧边栏引用（存活，见 §5 IA 决策）；
`system.py`/`features`/`/health` 无鉴权是有意设计（v1 Phase 0 决策）。

**删除口径**：沿用 v2 判据——「符号在全仓（源码+测试）无非定义引用」双重复核 + 删除后 `uv run pytest` 全绿。

---

## 4. 方向四：架构优化（含关键代码示例）

**结论：整体达标，无大结构调整。** API 层单实例+拦截器 ✓、Pinia 五 store ✓、CRUD 十件套工厂
（`useClusterResourceCore.ts`，约定 #24）✓、发布/版本/回滚单实现（约定 #18）✓、审计单入口（`AuditLog(` 仅 `services/audit.py`、`core/audit_hook.py`、models 三处）✓。
唯一结构调整 = M2 的 SSE 客户端收敛，关键代码：

```ts
// frontend/src/utils/sse.ts —— 泛型化 + GET 流支持（改造后）
export interface SSEEvent { type: string; [key: string]: unknown }

interface BaseOptions<T> {
  token?: string
  onEvent?: (event: T) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

// 供两套入口共用的解析循环（从现 createSSEClient 内提取，行为不变）
async function parseSSEStream<T extends SSEEvent>(response: Response, o: BaseOptions<T>): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() ?? ''
    for (const block of lines) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      o.onEvent?.(JSON.parse(dataLine.slice(5).trim()) as T)
    }
  }
  o.onComplete?.()
}

// SSEClientOptions 自身泛型化（url/body 保留，onEvent 收敛到 BaseOptions<T>，避免同名字段类型冲突）：
// interface SSEClientOptions<T = SSEEvent> extends BaseOptions<T> { url: string; body: Record<string, unknown> }
export function createSSEClient<T extends SSEEvent = SSEEvent>(o: SSEClientOptions<T>): AbortController {
  /* 现有 POST + Bearer fetch 逻辑不变，onEvent 以泛型 T 传递，内部改调 parseSSEStream */
}

// 新增：GET 型长连接（EdgeEnv 日志、节点任务日志共用）
export function createSSEReader<T extends SSEEvent = SSEEvent>(o: { url: string } & BaseOptions<T>): AbortController {
  const controller = new AbortController()
  void (async () => {
    try {
      const res = await fetch(o.url, { headers: o.token ? { Authorization: `Bearer ${o.token}` } : {}, signal: controller.signal })
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`)
      await parseSSEStream(res, o)
    } catch (e) {
      if (!controller.signal.aborted) o.onError?.(e as Error)
    }
  })()
  return controller
}
```

`api/database.ts` 三处 `as any` 随泛型化自然消除（调用处 `createSSEClient<MigrationTableProgressEvent>({...})`），
迁移顺序：先改 `utils/sse.ts` 泛型签名（database.ts 零改动即可通过）→ 删 database.ts 三处断言 → 逐个迁移三处手写循环（每处独立 commit，可单独回滚）。

---

## 5. 方向三：前端界面优化（含前后对比说明）

**已达标（v1/v2 落地，本轮复核）**：弹窗三层制（约定 #25）、发布/删除共享流程（#7）、格式化单实现（#26，
`formatDate` 私自重复 grep = 0）、PublishStatusTag、列配置弹层、`useDebouncedSearch`/`usePagination`、
console.log 残留 0、`getApiErrorMessage` 全局错误提取、路由全懒加载、Pinia 指标轮询带 `document.hidden` 守卫与 stopAutoRefresh。

**优化前后对比（本轮两个可交付项）**：

| 场景 | 前 | 后 |
|---|---|---|
| SSE 流式页面（迁移进度/任务日志/EdgeEnv） | 4 套各自维护的 fetch+getReader+chunk 切分实现；event 类型靠 `as any` 断言；修复粘包/中断 bug 需改 4 处 | 单一 `utils/sse.ts`（POST/GET 双入口 + 共享解析循环 + 泛型事件类型）；协议层 bug 单点修复，类型安全 |
| 集群列表/编辑（admin_key） | 列表接口明文回传密钥，编辑弹窗回填真实密钥到 DOM | 响应不含密钥；编辑留空=保持原值；密钥只在创建/显式修改时提交 |

**IA 双导航并存（P3，产品决策项，不擅自合并）**：侧边栏同时存在「集群管理 /clusters（旧版 ClusterList）+ /upstreams /routes /nodes…9 个顶层资源菜单」与「集群统管 /central-management（CentralList 卡片 + Cluster* Tab 新版 UX）」。
两套均存活、均有 e2e 覆盖，属信息架构层面的产品选择：若确认「集群统管」为目标形态，旧 9 菜单可收进集群详情或下线（涉及 `AppSidebar.vue` 菜单表 + 6 个旧视图 + 对应 e2e），预计 1–2 天，**须用户拍板后另立 openspec 变更**，本方案不动。

大文件观察项（不立项，按约定 #11 判据登记）：`CentralList.vue` 2457 行 / `EdgeClient.vue` 2047 行。
当前仍满足「会话读取原子单位」判据（无跨文件连读 3+ 的定位成本报告）；触发条件沿用 R1（~1500 行 + 零共享新职责 + 实际连读成本）。

---

## 6. 方向六：性能优化（复核结论：达标，无新项）

| 项 | 现状证据（本轮复核） | 结论 |
|---|---|---|
| 路由懒加载 | `router/index.ts` 全部 `() => import(...)` | ✓ |
| 构建分包 | vite8 rolldown `advancedChunks`（v2 7D 已提交，入口 index 1540→55.5 kB） | ✓ |
| 大表格 | 主要列表服务端分页（工厂 load 带 page/page_size/sort）；数据量级未触发虚拟滚动阈值 | 维持 v2 结论：>2k 行再评估 |
| 重复请求 | Dashboard `Promise.all`；指标名缓存（`metrics.ts:28` 已有数据跳过 2s+ 慢查询）；轮询带 `document.hidden` 守卫 | ✓ |
| 后端阻塞 | `time.sleep` grep = 0；ClickHouse 走 `asyncio.to_thread`（memory #9） | ✓ |

---

## 7. 方向七：工程化建设（达标 + 1 处回归修复）

ESLint 10 flat config + Prettier + husky 9 + lint-staged（约定 #27）✓；后端 103 测试文件、前端单测 79、E2E 32 ✓；
核心逻辑单测覆盖工厂/守卫/发布响应源码模式（约定 #16/#18）✓。TypeScript 已全面使用，「引入可行性」课题转为**维持生产脚本层 any 清零**——
本轮发现的 `api/database.ts` 3 处 `as any` 回归即该基线的执行样例（修复方案见 §4/M4）。
测试基线提示（memory #7）：约 11 个 vitest 用例（api/nodes、InstallOpenrestyDialog、router /dns-queries、Login、NodeList 等）在干净 HEAD 上同样失败，
验证以改动相关文件的定向测试为准，勿误判为新回归。

---

## 8. 方向八：可维护性提升（达标 + 2 个评估项）

全局错误处理（`getApiErrorMessage` + 后端全局异常不泄漏，`main.py:57-67`）✓；配置驱动（features.yaml 支持 mtime 热重载、
equivalence_rules.yaml、clickhouse.yaml、db_config.json）✓；操作日志（log_audit + audit_hook 全覆盖 + `GET /system/operations`）✓；
配置版本回滚（`rollback_resource` 单实现）✓。

| 评估项 | 结论 |
|---|---|
| `backend/app/config/plugin_definitions.py`（1312 行插件 schema 数据内嵌 Python） | **评估后缓做**：它是代码型数据（类型被 import 校验），YAML 化需引入运行时解析+校验层，收益（运营可编辑）当前无人消费，登记为待观察；若产品提出「不改代码加插件」需求再立项 |
| AGENTS.md 约定 #19 措辞与代码不符 | 8A 顺带修订（见 S-3） |

---

## 9. 执行计划、风险与测试建议

| 阶段 | 内容 | 预估 | 风险 | 验证 |
|---|---|---|---|---|
| 8A 安全 P0 | S-1 守卫补样(RED)+5 端点鉴权(GREEN)；S-2 admin_key 响应脱敏 + 表单留空语义；S-3 AGENTS.md #19 修订 | 1.5h | 中（触碰集群 CRUD 主链路 + 表单编辑语义） | `uv run pytest tests/test_security_guard.py tests/test_auth.py -q` → 全量 pytest；手工闭环：编辑集群不动密钥保存 → 节点连通测试仍通过；匿名 curl `/api/v1/clusters` → 401；E2E `login.spec` + 集群列表相关 spec |
| 8B 合并+死代码 | M1 escapeHtml 收敛；M4+M2 sse.ts 泛型化、database.ts 去 as any、三处 SSE 迁移；D1–D3 删除 | 2h | 低-中（SSE 迁移触碰日志长连接与迁移流） | `npx vue-tsc -b` + 定向 vitest（utils/ansi、tools/diff、api）+ `npm run build`；SSE 迁移后手工跑一次数据库迁移（SSE 全程进度）+ EdgeEnv 日志流 + 节点任务日志；删除后 `uv run pytest` 全绿 |
| 8C 治理（可拆散按需） | M3 六视图 API 模块迁移（每视图独立 commit）；IA 双导航 → 出产品决策工单 | 2h + 决策 | 低 | 每视图迁移后 `vue-tsc` + 对应 e2e spec（user.spec / 集群列表 spec 等） |

**风险点**：

1. **8A 是唯一触达主链路的阶段**：`get_cluster/stats` 补鉴权后，若有遗漏的前端匿名调用会当场暴露（前端全部带 token，实测风险低，但需全量 E2E 回归集群相关 spec）；`admin_key` 脱敏必须与表单「留空保持」同步落地，只改一侧会出现「保存即清空密钥」事故——**务必先确认 `update_cluster` 对未传字段不覆盖再动响应模型**。
2. **SSE 迁移保持行为逐字节等价**：三处手写实现的 chunk 切分策略可能有细节差异（如按 `\n\n` vs 按 `data:` 行、断线重连逻辑），迁移前先读全三处源码，diff 语义差异列表化确认后再替换；`useInstallStream` 承载安装流，迁移后必须完整跑一次安装向导。
3. 守卫测试 POST 样例断言 401，若未来有端点改为公开会立即测试失败——这是有意设计（防回归），处置时应更新采样表而非删样例。
4. 每阶段独立 commit（`type: 中文描述` 风格），禁止跨阶段混合提交；8B 内 M1/M4/M2/D 三类改动也分别 commit。
5. 不做项（IA 合并、plugin_definitions YAML 化、虚拟滚动、JWT 大改、useClusterUtils 拆分、TypeDecorator）如需重启，须有新证据/产品决策，防止范围蔓延。

---

## 10. 维持决策台账（历轮延续，防止复读）

R1 useClusterUtils 单文件（触发条件见 v2）；R2 集群 Tab 工具栏缓做；R3 后端列表骨架不做；R4 模板 any 增量；
清单/自启动密码明文（用户决策，禁掩码）；JWT 维持 24h（可选生产 8h）；虚拟滚动 >2k 行再评估；
IA 双导航 = 待产品决策（本方案新增登记）。
