# 磐石 Gateway 重构方案 v2（增量治理）

> 日期：2026-08-30 · 范围：backend/app + frontend/src · 证据基准：本次全量增量侦察（grep + 源码核验）
>
> **前置说明**：v1 方案（`docs/refactoring/refactoring-plan-2026-08-29.md`）八个方向已全部落地
> （Phase 0 安全加固 83f9525 / Phase 1 死代码+合并 5700f27+7851130 / Phase 2 UI 统一 1236394+2f9663f+6bb93ca /
> Phase 3 回滚+错误提取 9245ebe / Phase 4 双工厂合并 db7f475 / Phase 5 工程化 20cfc8d / Phase 6 资源级权限+审计 142c058）。
> 本文档**不重复 v1 已完成项**，只给出经当前代码验证的**真实剩余问题**与执行计划。
>
> **实施状态（2026-08-30）**：7A 死代码已提交（6364c76，stash 对照确认失败集=基线）；
> 7B 安全已提交（89fac27：auth safeParse+3 单测、PluginSwitches 转义、escapeHtml 收敛单实现；
> Tools.vue diff 核验已转义；可选 JWT 8h 未做，留待决策）；7D vite 分包已提交（50a1339：
> 入口 index 1540→55.5 kB，E2E 全量 91 绿）；7C（useClusterUtils 拆分）**经讨论决定取消**——理由与触发条件见 R1 决策记录。

## 0. 执行摘要

v1 之后代码库健康度进一步提高，本轮排查确认**无 P0 级问题**。剩余为 1 个小面积真实注入面（v-html）、
3 处死代码、1 个 843 行职责混杂大文件、若干低优先级治理项。按 ROI 排序为 4 个阶段（Phase 7A–7D），
总量约 1–2 天工作量，均可独立提交回滚。

| 级别 | 问题 | 状态 |
|---|---|---|
| P1 | PluginSwitches `warningHtml` 未转义拼接后端数据（v-html 注入面） | 7B 修复 |
| P1 | `stores/auth.ts` 对 localStorage 损坏 JSON 直接 `JSON.parse`，启动即崩溃（v1 S5 遗留） | 7B 修复 |
| P2 | `useClusterUtils.ts` 843 行 / 15 导出 / 4 类职责混杂（v1 A2 遗留且膨胀 +122 行） | **已取消**（维持单文件，触发条件见 R1 决策） |
| P2 | 死代码 3 处（FilterChip / MethodTag / api/dnsProxy.ts） | 7A 删除 |
| P3 | CentralList 调试 console.log 残留 | 7A 清理 |
| P3 | vite 无 manualChunks 分包 | 7D 评估 |
| P3 | JWT 24h 无续期 / localStorage 存 token | 7B 给评估结论（倾向维持现状） |

---

## 1. 死代码清单及判断依据（Phase 7A）

| # | 目标 | 判断依据（可复核） | 处置 |
|---|---|---|---|
| D1 | `frontend/src/components/FilterChip.vue` | 全仓 grep `FilterChip`：除组件自身外**仅** `components/__tests__/FilterChip.test.ts` 引用；`main.ts` 无全局注册（无 `app.component(` 调用）；无异步动态 import。生产零消费 | 删组件 + 对应测试 |
| D2 | `frontend/src/components/MethodTag.vue` | 同 D1，仅自测引用。发布状态渲染已由 `PublishStatusTag.vue` 统一承担（v1 U2），二者功能重叠且后者在用 | 删组件 + 对应测试 |
| D3 | `frontend/src/api/dnsProxy.ts` | 全仓 grep `dnsProxy`：0 处引用（连测试都没有）。DNS 代理视图（`DnsUdpProxyList/DnsHttpProxyList`）直接经 `@/api` 实例调用，未经此模块 | 删模块 |
| D4 | `frontend/src/views/CentralList.vue:1333,1337` | `console.log('[删除集群] ...')` 调试残留，非错误日志通道 | 删除两行 |

**保留判定的反例（防误删说明）**：

- `backend/app/api/v1/system.py`、`features`、`/health`：无鉴权是**有意设计**（v1 Phase 0 决策），非死代码。
- 清单密码明文返回：用户明确决策（历史教训 2026-08，掩码写回文件损坏凭据，commit c88aa26 移除），**不得**再列改造项。
- `utils/ansi.ts`、`escapeHtml`：被 EdgeEnv/Tools/NodeExecutionResultDrawer 在用，非死代码。

**判断依据口径**：以「模块默认导出名在全仓（src + e2e）无非自身、非测试引用」+「无全局注册/动态加载路径」双条件成立才判死；
删除后跑 `npx vue-tsc -b` + 全量 vitest 验证编译与测试不破。

## 2. 函数合并与代码治理（Phase 7C）

### R1 `useClusterUtils.ts` 拆分 —— **决策：不拆（2026-08-30）**

> **决策记录**：经讨论取消本项。核心依据：本仓库主要由 LLM 会话维护，文件边界的正确切分维度是
> **"会话读取的原子单位"** 而非"职责的哲学分类"。单文件 843 行 ≈ 8k tokens，一次 read 获得完整上下文
> （共享的 AppModal/进度/错误基础设施尽收眼前）；拆成 4 文件后每个新会话从零开始，漏读 helper 与间接层
> （shim + 多 import 路径）成本上升、真实 token 开销反而更高，且删除/发布/批量三流程共享 modal 基础设施，
> 切开后只能复制 plumbing 或互相 import，两头变差。本文件还是 Phase 4 合并的产物（memory #30
> "新资源一律基于这两个工厂"依赖其单点可发现性），拆回去等于稀释刚做的合并决策。
>
> **重启触发条件**（满足任一再评估，映射表可作起点）：
> 1. 文件突破 ~1500 行，或出现与既有流程**零共享代码**的新职责；
> 2. 团队引入非 LLM 协作者，或小上下文子代理成为主要维护方式；
> 3. 某次跨切面修改实际发生"连续读 3+ 相邻文件才能安全下笔"的定位成本。
>
> **替代动作（已含在本决策内，低优先）**：保留 4 段 section banner，文件头补一份导出清单 TOC 注释即可。

以下为原拆分方案（若触发重启则参照执行）：

现状导出清单（`grep -n '^export'` 实测）分四类职责：

| 职责 | 导出 | 拆入 |
|---|---|---|
| 删除确认/进度 | `showDeleteConfirm`、`buildDeleteProgressContent`、`executeDeleteWithProgress`、`DeleteProgressOptions`、`ResourceKey`、`showNameConfirm` | `composables/useDeleteFlow.ts` |
| 批量结果弹窗 | `BatchResultItem`、`showBatchResultModal`、`BatchStatusItem`、`showBatchStatusModal` | `composables/useBatchModal.ts` |
| 发布流程 | `PublishResultData`、`PublishOptions`、`executePublish`、`publishStatusRender` | `composables/usePublishFlow.ts` |
| 常量 | `resourceLabels` | 并入 `utils/format.ts` 同级的 `utils/labels.ts` |

**策略**：先建新文件挪实现，`useClusterUtils.ts` 原位置改为一行 `export * from ...` re-export shim（导入方零改动、可分次迁移）；
所有调用方迁移完毕后再删 shim。这是项目既有惯例（memory #30：`VersionModalState` 单定义 + 重导出）。
**测试契约**：`__tests__/useClusterUtils*.ts` 同步拆分为对应测试文件；若存在源码模式守卫测试依赖本文件路径，需同步更新（项目惯例，见 memory #22 同类先例）。

### R2 集群 Tab 工具栏抽取（低优先级，可选）

6 个 `views/clusters/Cluster*.vue` 的工具栏（添加/复制/删除 + 发布/版本 + ColumnConfigPopover + 搜索）仍有 2–10 处/文件的按钮结构重复。
v1 U3 已收敛列配置弹层，剩余按钮排列属**布局重复而非逻辑重复**，抽取 `ClusterToolbar.vue` 收益中等、改动面大（6 视图模板重写 + E2E 选择器回归），
**建议缓做**，待某视图因功能变更本来就要改时顺带抽取。

### R3 后端列表骨架（不做）

11 个 `cluster_*.py` 的 list 端点各有搜索/排序/分页写法，但单文件仅 ~11 个函数、无逐字复制块（v1 A4 的 history/rollback 三件套已收敛到
`edge_sync.rollback_resource`，memory #21）。为此引入通用分页中间件属过度设计，**明确不做**，避免违反 AGENTS.md 约定 #3（简单 CRUD 直连 SQLAlchemy）。

### R4 `.vue` 模板存量 `any`（474 处，维持增量策略）

v1 Phase 5 决策：脚本层 any 已清零，模板层 474 处保留 warn 增量治理（memory #27）。**维持原策略**，不单独立项——专项清理需全量回归 UI，ROI 为负。

## 3. 前端界面与体验优化（含前后对比）

### U1 `stores/auth.ts` 崩溃保护（P1，Phase 7B）

**现状**（实测 `stores/auth.ts:6-10`）：

```ts
const storedUser = localStorage.getItem('user')
const user = ref<User | null>(storedUser ? JSON.parse(storedUser) : null)   // 损坏 → 抛异常，app 白屏
```

v1 曾点名此问题（S5），Phase 0 未覆盖（当时聚焦后端鉴权），至今仍在。

**修复**：统一 `safeParse<T>(raw, fallback)`，解析失败视同未登录（清 token 跳登录页），并在 `login()` 写入处保持现状。

```ts
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
const user = ref<User | null>(safeParse<User | null>(localStorage.getItem('user'), null))
const permissions = ref<string[]>(safeParse<string[]>(localStorage.getItem('permissions'), []))
```

补 2 个单测：损坏 JSON 不抛出、回退 null/[]。

### U2 v-html 注入面收口（P1，Phase 7B）

排查结论（逐处核验源码）：

| 位置 | 数据源 | 是否转义 | 判定 |
|---|---|---|---|
| `AppSidebar.vue:26` 图标 | 代码内硬编码 SVG | 无需 | 安全（可选加 DOMPurify 纵深防御，低优） |
| `EdgeEnv.vue:62/113/182`、`NodeExecutionResultDrawer.vue:108/116` | 远程节点日志/ diff | `ansiToHtml`/diff 构建均先 `escapeHtml` 再拼白名单 span（`utils/ansi.ts:66-100`、`EdgeEnv.vue:494-504`） | 安全 |
| `Tools.vue:222` diff | 后端返回配置 | 需实现时核验其构建函数是否走 escape（与 EdgeEnv 同款实现） | 待核验 |
| `PluginSwitches.vue:274` | `warnings.map(w => ...${w.plugin}...)` **未转义直拼**（`:266-271`） | 否 | **真实注入面，必须修** |

**修复**：`PluginSwitches.vue` warningHtml 构建处 `${w.plugin}` → `${escapeHtml(w.plugin)}`（`escapeHtml` 已在 `utils/ansi.ts:45` 导出可复用，或提为公共 util）。
插件名虽为管理员录入（攻击面窄），但这是本仓唯一未转义的 v-html 拼接点，一行修复即闭环。

### U3 高频操作路径（结论：无新大项）

v1 已统一：弹窗体系（AppModal + useOverlayModal，memory #31）、发布/删除共享流程（executePublish/executeDeleteWithProgress，memory #7）、
日期/文件大小格式化（utils/format，memory #26）、发布状态标签（PublishStatusTag）。本轮未发现新的显著多步冗余；用户管理页交互已按本轮需求收敛完成。

## 4. 架构优化（结论：无结构调整需求）

- API 层：`api/index.ts` 单实例 + 请求/响应拦截器（401 统一登出跳转），按资源分模块（AGENTS.md 约定 #6），达标。
- 状态管理：Pinia（auth/theme/features），列表状态全部在 composable 工厂内（memory #30），无散落。
- 后端：发布/版本/回滚编排单实现（memory #21）、权限依赖工厂（memory #28）、审计单入口 `log_audit`，达标。
- 唯一遗留 = R1 大文件拆分（已决策取消，维持单文件，见 R1 决策记录）。

## 5. 安全加固（Phase 7B）

| # | 项 | 措施 / 结论 |
|---|---|---|
| S1 | v-html | 见 U2，1 处必修 |
| S2 | JWT 24h 无 refresh（`security.py:81` `JWT_EXPIRE_MINUTES=1440`），token 存 localStorage | **评估结论：维持现状**。理由：内网网关管理系统；refresh + httpOnly cookie 方案需双端改造且与 Vite 代理/Edge 直连流冲突面大；折中改进（可选）：生产环境 `.env.production` 配 `JWT_EXPIRE_MINUTES=480`（8h），零代码。密钥治理 v1 已完成（memory #23） |
| S3 | 未鉴权接口 | v1 Phase 0 已补齐 20 文件 + 守卫测试防回归；本轮 grep 未发现新增裸路由。权限细化（清单/自启动/数据库管理独立键）已随 commit fc29a52 落地 |
| S4 | 敏感配置脱敏 | SSL 私钥抽屉默认掩码（保留）；清单密码明文为用户决策（**不得改**，memory #29）；`db_config.json` 密码 Fernet 加密存储，达标 |
| S5 | 越权 | `require_permission`/`require_any_permission` 全资源门控（memory #28）；adminOnly 路由前端守卫已对齐（`router/index.ts`） |

## 6. 性能优化（Phase 7D，评估性质）

| # | 项 | 现状证据 | 措施 |
|---|---|---|---|
| P1 | 路由懒加载 | `router/index.ts` 全部 `() => import(...)` | 已达标 |
| P2 | 构建分包 | `vite.config.ts` 无 `manualChunks`（grep 0 命中） | 配置 echarts/antd/monaco vendor 分包 + `rollup-plugin-visualizer` 实测一次产物；预期首屏 chunk 明显下降。**独立可回滚** |
| P3 | 大表格 | 40 个 `a-table`，主要列表均服务端分页（工厂 load 带 page/page_size/sort，v1 已修 upstreams N+1） | 暂不引入虚拟滚动：现有数据量级（网关配置条目）不足以触发渲染瓶颈；仅当某表出现 >2k 行服务端计数时再评估 |
| P4 | 重复请求 | Dashboard `Promise.all` 并行（v1 侦察确认）；ECharts 三处均 `echarts/core` 树摇（v1 e880fe4 确认） | 已达标 |

## 7. 工程化建设

v1 Phase 5 已建立 ESLint flat config + Prettier + husky + lint-staged（memory #27），本轮用户管理改动全程走该管线验证。
~~新增要求仅一条：R1 拆分产出的 `useDeleteFlow/usePublishFlow/useBatchModal` 必须带等价迁移单测~~（随 R1 取消而失效；若重启拆分，此要求恢复）。
「工厂逻辑必有单测」基线维持。TypeScript 评估项（模板 any 474）见 R4，维持增量策略。

## 8. 可维护性提升

- 全局错误处理：前端 `getApiErrorMessage`（v1 M5）、后端全局异常不泄漏（v1 S2）——达标。
- 配置化：`backend/app/config/*.yaml`（等价规则、ClickHouse）已配置驱动；未发现新增值得外提的硬编码常量。
- 操作日志：`log_audit` + `GET /system/operations`（v1 M1）达标；本轮用户权限编辑已接入审计（users.py `update_permissions`）。
- 版本回滚：`rollback_resource` 工厂（v1 Phase 3）达标。

## 9. 执行计划、风险与测试建议

| 阶段 | 内容 | 预估 | 风险 | 验证 |
|---|---|---|---|---|
| 7A 死代码 | D1–D4 删除 | 0.5h | 极低 | `vue-tsc -b` + 全量 vitest + `npm run build` |
| 7B 安全 | U1 auth 崩溃保护、U2 PluginSwitches 转义、（可选 S2 生产 JWT 8h） | 1h | 低 | 新增单测 ×3（损坏 JSON 回退 ×2、escapeHtml 生效 ×1）+ E2E 全量（登录流必测：`e2e/login.spec.ts`、`user.spec.ts`）；手工验证登录页在 localStorage 被塞垃圾串时可正常进入 |
| ~~7C 治理~~ | ~~R1 拆分~~ **已取消**（决策与触发条件见 R1 决策记录） | — | — | — |
| 7D 性能 | P2 vite manualChunks + 产物分析 | 1h | 低 | `npm run build` 产物对比（dist 尺寸 + 首屏 chunk 数）+ E2E 全量回归 |

**总体风险点**：

1. ~~R1 是本轮唯一中等风险项~~（R1 已取消，风险项随闭；若按触发条件重启，原约束仍然有效：`showDeleteConfirm/showBatchResultModal` 等被 8+ 视图间接引用，务必用 shim 保证 import 兼容，禁止一次性改全部调用方）。
2. 7B 触碰认证 store——修改后必须手工走一遍「登录 → 刷新页面 → 退出」闭环，防止权限 store 初始化时序问题（features store 加载顺序在 auth 之后，参考 `main.ts` 挂载序）。
3. 每阶段独立 commit，出问题按阶段回滚；不做跨阶段混合提交（对齐仓库 `type: 中文描述` 风格）。
4. 不做项（R2/R3/S2 大改/P3 虚拟滚动）如需重启，须有新的性能/工单证据，防止范围蔓延。
