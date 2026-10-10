# global-rule-ux-close-loop Design

## Context

插件组与上游已落地完整的「保存→待发布→发布→已发布」闭环，基础设施全部就绪且均为单点：

- `edge_sync.derive_pending_publish`（edge_sync.py:283）——pending 推导共享 helper，含 None 守卫；插件组/上游四条列表链路已接线，`global_rules.py:84-92` 与 `cluster_global_rules.py:35-41` 未接；
- `publish_resource` 内 `hasattr(resource, "last_publish_status")` partial 写回（edge_sync.py:213-214）——**加列即自动接入**；
- `create_config_version` 内 `hasattr(entity, "updated_at")` 时间对齐——`GlobalRule` 已有 `updated_at` 列（models/cluster.py:199），发布后 pending 自然回 False，**免费获得**；
- `PublishStatusTag` 组件原生支持四态，插件组页 `PluginConfigList.vue:60-65` 已接线；
- 共享删除确认（`useClusterUtils.showDeleteConfirm`）已有黄底警示行样式先例（useClusterUtils.ts:159-168），删除集群链路已有节点全量取数先例（`page_size=PAGE_SIZE_DROPDOWN`，useClusterUtils.ts:1078）。

全局规则侧现状：`GlobalRule` 无 `last_publish_status` 列；响应 schema 缺 `pending_publish`/`last_publish_status`；主页面卡片「badge + PublishStatusTag」双显状态；集群子页手写表单（`ClusterGlobalRules.vue:48-78`）无 dirty 保护、`a-form-item :rules` 未包裹带 model 的 `a-form`（校验永不触发）；集群子页硬编码插件白名单 `['traceid','monitor']`（:68），主页面经 `PluginEntityFormModal` 开放全量；加载失败被 `useClusterPluginEntity.ts:94-101` 吞成空数组；节点取数两处（`PublishConfirmModal.vue:128`、`GlobalRuleList.vue:233`）未传 `page_size`（后端默认 20，nodes.py:24）；版本弹窗资源名词三元链兜底 `'插件'`（VersionManagementModal.vue:9-23）。

决策期补充核验（2026-10-10 讨论确认）：① `GlobalRule.updated_at`（cluster.py:199）确认带 `onupdate`——pending 推导链无隐藏缺口；② features.yaml 已有部署级插件白名单 `enabled_plugins`（features.py:83-86，空 = 不限制），`GET /plugins/builtin` 已将其作为 Layer 1 硬上限（plugins.py:21-40，`all=1` 亦生效），机制已由主 spec `deployment-feature-config` 完整规格化；现值 6 个插件**不含** traceid/monitor，而两者均在 BUILTIN_PLUGINS 目录内（plugin_definitions.py:446/476）——集群子页硬编码实为绕过部署白名单的遗留；③ 主 spec `publish-node-select` 本就要求「SHALL display **all** nodes」（M4 是实现偏离既有 spec 的缺陷，修复即合规）；④ 删除确认的集群警示行是 `opts.isCluster` 驱动的**硬编码文案**（useClusterUtils.ts:158-168），不是通用参数。

A1 二次修订（用户确认）：`enabled_plugins` 是部署级**全平台**启用契约，语义上不承担「全局规则可用插件列表」——改用新增专用 key `global_rule_plugins`（见 D8）。校验器核验：顶层未知 key 现状不拒绝（`concurrency` 先例，unknown 检查仅作用于 `features` 映射内部），新 key 需补列表类型校验；`get_features()` 整体返回 → `GET /system/features` 自动暴露新 key（向后兼容：只增不改）。

## Goals / Non-Goals

- **Goals**：全局规则接入既有发布状态闭环（接线，不新造）；删除风险感知补齐；资源名词纠错；节点全量取数；集群子页体验收敛到共享实现；低成本文案/视觉一致性。
- **Non-Goals**：见 proposal「不做」清单（查看增强另立项、权限门控待角色矩阵、同名约束另立项、版本提示扩大与引用检查待决策）。

## Decisions

### D1. 发布状态接线全部走既有单点，禁止全局规则侧本地推导

两个列表端点（`GET /clusters/{id}/global_rules`、`GET /api/v1/global_rules`）均经 `derive_pending_publish` + publish-map 回查推导 `pending_publish`，与插件组/上游同口径；前端 MUST NOT 本地推导（对齐 `UpstreamResponse`/`PluginConfigResponse` 的注释约定）。回滚经 `rollback_resource` 恢复字段 + commit，`updated_at` onupdate 自然置 pending——与既有语义一致，不特判。

### D2. `last_publish_status` 列按既有同款三件套接入

`GlobalRule` 补 nullable `String(16)` 列 → 注册 `COLUMN_MIGRATIONS`（约定 #118，漏注册将启动 crash-loop）→ `publish_resource` 既有能力探测自动写回，零代码。合入前跑 PG 方言冒烟（约定 #31/#103）。

### D3. 删除警示行走共享确认的可选参数，两入口一致

`showDeleteConfirm` 新增**通用** `extraWarning` 可选参数（渲染位置/样式复用既有黄底警示行，现有 `isCluster` 硬编码警示行保持不动，向后兼容），仅全局规则调用点传入，集群名由调用点传入（主页面卡片 topbar 已有集群名，集群子页有 cluster prop）。措辞按「作用于集群全部路由、Edge 同步删除后立即失效」表述。引用检查**不做**：当前认知为全局规则无逐路由绑定、全量生效（Q2 待确认；若存在绑定关系，警示措辞与引用检查另行立项）。

### D4. 版本弹窗资源名词收敛为常量映射

resourceType→中文名建常量映射（对齐 `useClusterUtils` 既有 `resourceLabels` 范本），替换 `VersionManagementModal` 的三元链；`global_rule`→「全局规则」、`plugin_config`→「插件组」同修。版本弹窗标题的 edge_uuid 两入口统一去掉（对运维场景价值存疑，取更简形态）。

### D5. 发布/删除节点取数显式全量（用户决策 A2：共享组件内修）

修复落在共享 `PublishConfirmModal` 内部：`fetchNodes` 显式传 `page_size=PAGE_SIZE_DROPDOWN(500)`（对齐删集群先例 useClusterUtils.ts:1078）——路由/上游/插件组等**所有资源**的发布弹窗节点列表同步变全量，同款 bug 一次全修。该修复同时是对既有主 spec `publish-node-select`（「Publish confirm dialog SHALL display **all** nodes」）的实现合规修复，无需新增 delta；删除链路节点取数（`GlobalRuleList` 调用点）同步传全量。回归按约定 #51④ 覆盖既有发布流相关测试。

### D6. 集群子页表单收敛到 `PluginEntityFormModal`（与插件组 M1 的区别：这是接线不是重构）

`PluginEntityFormModal` 已声明支持 `global_rule` resourceType（含 displayName 推导），收敛 = 传 `clusters=[props.cluster]` + 编辑时禁用集群选择（组件既有逻辑），一次性继承误关保护、跨 Tab 校验、统一保存 toast、统一插件选择器。与插件组变更把「双实现收敛」defer 的理由不同：全局规则集群子页表单是**孤实现**（无既有共享依赖），收敛是删除手写代码而非迁移既有能力。手写 modal 与相关死代码随之移除。

### D7. 错误提示统一 `getApiErrorMessage`

列表加载、保存、版本加载等 catch 分支统一经 `getApiErrorMessage`（utils/error.ts）透出后端原因，兜底文案保留资源名语境（如「加载全局规则失败：{原因}」）。

### D8. 插件口径统一走 features.yaml 专用清单 `global_rule_plugins`（用户决策 A1，二次修订：不复用 enabled_plugins）

`enabled_plugins` 是部署级全平台启用契约（Layer 1 硬上限），语义上不承担「全局规则可用插件列表」。新增专用 key **`global_rule_plugins`**（与 `enabled_plugins` 同级、列表类型）。落地五件事：

1. `app/core/features.py`：新 key 列表类型校验（对齐 `enabled_plugins` 先例）+ `get_global_rule_plugins()` 单点 accessor（空/未配置 = 不限制，返回 `[]`）；`GET /system/features` 经 `get_features()` 整体返回自动暴露（向后兼容）。
2. 前端 features store 解析新 key；收敛后的共享 `PluginEntityFormModal` 对 `global_rule` 资源按清单过滤插件目录（**两入口单点**；`enabled_plugins` 仍在目录层作为平台硬上限并行生效，最终可见集 = 目录 ∩ 清单）。
3. 删除集群子页硬编码 `['traceid','monitor']`（随任务 6.1 表单收敛自然消除，组件测试显式断言两入口同源）。
4. `backend/features.yaml` 默认发 `global_rule_plugins: [traceid, monitor]`——集群子页现状精确保留，主页面全局规则表单从全量收紧到这 2 个（**不动 `enabled_plugins`**）。
5. 后端不做全局规则保存校验（与现状硬编码同级的前端引导过滤；Edge 不校验载荷，平台侧保存校验增强属后续决策）。

后续调整清单 = 只改 features.yaml（mtime 热加载，下次进表单即生效），免改代码、免重启。

### D9. 工具栏计数摘要本地计算

「未发布 Y · 待发布 Z」由列表数据本地统计（`current_version` 为空 = 未发布；`pending_publish` = 待发布），不发新请求；数据源即 D1 的后端字段。超过卡片网格单次取数上限（500 条）被截断时，Y/Z 基于已加载数据统计，与「仅显示前 500 条」截断提示并存（不暗示全量口径）。

### D10. 验收必须落在真实页面（约定 #51②）

组件/API 断言不能替代页面验收：主页面与集群子页实际渲染确认四态标签、删除警示、表单行为、失败态。

### D11. 加载失败态共享修（用户决策 A3：两资源同受益）

`useClusterPluginEntity.loadItems` 的 catch 从「吞成空数组」改为失败态契约（错误信息 + 可重试），全局规则与插件组两个集群子页同步接入失败态 UI（「加载失败：{原因}」+「重试」）。插件组集群子页（`ClusterPluginConfigs.vue`）是共享修的连带受益方——本变更一并落其 UI、更新其测试并回归（delta 挂 `cluster-plugin-configs-component`），避免同款缺陷只修一半。

## Risks / Trade-offs

- **共享层改动波及全站**（D3 删除确认参数、D4 名词映射、D5 共享发布弹窗节点全量、D11 共享 composable 失败态契约、D8 新 key 默认值使主页面全局规则表单从全量收紧到 2 个）→ 参数可选/默认行为不变；按约定 #51④ 回归同域既有测试（`useClusterUtils` 单测 + 发布流/删除确认/版本弹窗视图测试 + 插件组集群子页测试），验收落在用户实际操作的页面。
- **features.yaml 校验扩展**（D8）→ 新 key 校验对齐 `enabled_plugins` 先例；文件不存在/未配置时 accessor 返回 `[]`（不限制），`GET /system/features` 只增字段向后兼容；跑既有 features 校验测试防回归。
- **`last_publish_status` 列迁移** → `COLUMN_MIGRATIONS` 注册 + PG 冒烟双保险（约定 #118/#31）。
- **集群子页表单收敛**（D6）触及既有增删改路径 → 以 `useClusterPluginEntity` 现有 deps 链路为界，收敛后跑全局规则域既有测试 + 组件测试；如发现手写 modal 存在未见行为（如特殊默认值），收敛前先对照核实。
- **状态双显移除**（P0-1）改变卡片视觉 → 视觉差异在实页验收中截图确认，`PublishStatusTag` 单一表达是插件组页已验收的先例形态。

## Migration Plan

纯增量：新列 nullable、schema 字段带默认值、共享层参数可选。无数据回填——存量行 `last_publish_status` 为 NULL（视为全成功）、`pending_publish` 由推导即时计算。无新增端点，`test_security_guard.py` 无需变更。

## Open Questions

- ~~H2 白名单方向~~ **已决策（2026-10-10 讨论，二次修订）**：不复用 `enabled_plugins`（部署级全平台契约，语义不符）——新增专用 key `global_rule_plugins`（D8），默认 `[traceid, monitor]`。
- **「将创建新版本 v(N+1)」提示**：插件组已 opt-in（useClusterPluginEntity 有记录决策），全局规则每次发布同样 +1 版本，是否扩大 opt-in？
- **删除语义确认**：Edge 侧全局规则是否真的「作用于全部路由、无逐路由绑定」？→ 决定 D3 措辞终稿及是否需要引用检查（若有绑定，另立项）。
- **只读角色矩阵**：是否存在需要隐藏「添加/编辑/删除/发布」的角色？→ 本期不做权限门控。
