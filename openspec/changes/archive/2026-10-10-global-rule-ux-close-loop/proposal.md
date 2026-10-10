# global-rule-ux-close-loop Proposal

## Why

全局规则模块 UX 评审（2026-10-10，评审报告见会话记录）发现：模块骨架健康（共享发布/删除进度弹窗、误关保护、双模式表单组件均在），但它是插件组闭环改造（change `2026-10-10-plugin-group-ux-close-loop`）**未跟上车**的那一个：

- **保存 ≠ 生效完全不可感知**（H1，已核实）：`GlobalRule` 模型无 `last_publish_status` 列（`PluginConfig` 有）、两个列表端点均未调用 `edge_sync.derive_pending_publish`（插件组/上游四条链路都调了）、响应缺 `pending_publish`/`last_publish_status` 字段。编辑已发布全局规则并保存后，卡片依旧显示「已发布 v3」。全局规则作用于集群**全部路由**，这是全模块风险最高的一条。
- **两个入口可选插件集合不一致**（H2）：集群子页 Tab 硬编码 `['traceid','monitor']`，主页面开放全量插件树，两侧都无解释。
- **版本管理弹窗把「全局规则」叫成「插件」**（H3）：资源名词三元链兜底错误，出现在回滚高危操作入口上（`plugin_config` 同病）。
- **删除缺「影响全部路由」警示**（H4）：删除确认只有一行通用提示，保护力度弱于爆炸半径更小的插件组，风险感知与实际风险倒挂。

另有一批中低成本缺陷顺带修复：集群子页加载失败被吞成空态（M1）、手写表单无校验无误关保护（M2）、发布确认标题缺资源名（M3）、发布/删除节点取数静默截断 20 条（M4）、错误文案不带原因（M6）、空态无行动分支（M7）及 L2/L3/L4/L5/L6/L7/L8。

修复路径均为「接线/对齐插件组与上游先例」而非新造。

## What Changes

**P0（本期核心）**

1. **发布状态接线（H1）**：后端两个列表端点统一输出 `pending_publish`（复用 `edge_sync.derive_pending_publish` 单点）；`GlobalRule` 补 `last_publish_status` 列并注册 `COLUMN_MIGRATIONS`（`publish_resource` 既有 `hasattr` 探测加列即自动接入；`GlobalRule` 已有 `updated_at`，`create_config_version` 对齐后发布 pending 自然回 False）；前端两入口接入 `PublishStatusTag` 四态并移除「badge + tag」双显；两条保存路径成功 toast 对齐先例文案（「配置尚未发布，需发布后才会在 Edge 节点生效」）；主页面工具栏计数升级为「共 X 个 · 未发布 Y · 待发布 Z」。
2. **删除风险警示（H4）**：共享删除确认追加可选的集群级警示行（黄底样式先例已存在），全局规则两入口传入：「作用于集群「{cluster}」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置」。引用检查不做（语义待确认，见 Open Questions）。
3. **版本弹窗资源名词表（H3）**：resourceType→中文名收敛为常量映射（对齐 `useClusterUtils` 既有 `resourceLabels` 范本），修 `global_rule`→「全局规则」、`plugin_config`→「插件组」。
4. **发布/删除节点取数全量（M4，用户决策 A2）**：修复落在共享 `PublishConfirmModal` 内部（`fetchNodes` 显式传 `page_size=500`）——路由/上游/插件组等**所有资源**的发布弹窗节点列表同步变全量（同款 bug 一次全修；该修复同时是对既有 spec `publish-node-select`「SHALL display all nodes」的实现合规修复，无需新增 delta）；删除链路节点取数同步传全量。回归范围按约定 #51④ 覆盖既有发布流测试。

**P1（顺带，低风险）**

5. **集群子页体验收敛（M1/M2/M7/L6）**：手写表单换用 `PluginEntityFormModal`（`clusters=[props.cluster]`、编辑禁选集群，硬编码插件白名单随之删除），一次性继承误关保护、跨 Tab 校验、统一保存 toast；保留既有 `emit('refresh')` 父页联动；加载失败态与空态区分（失败给「重试」）；空态给「无数据→创建」分支（集群子页无筛选器，清空筛选分支属主页面）；移除无消费方的卡片选中高亮。**失败态修复落在共享 `useClusterPluginEntity`（用户决策 A3）**：插件组集群子页同款缺陷同步修复（失败态 UI + 回归）。
6. **文案与错误一致性（M3/M6 + 文案批）**：发布确认标题带资源名；列表加载失败经 `getApiErrorMessage` 透出原因；页头描述纠正（删去插件组的「可被多个路由引用」复制，改为「对所属集群的全部路由生效，修改后需发布才会在 Edge 节点生效」）；名称输入 `maxlength=100`（对齐后端约束）；「无插件」→「未选择插件」+ hover 说明；发布弹窗无节点时给指路文案；搜索框 `allow-clear` + 替换 emoji 图标；超 500 条截断提示；版本弹窗 edge_uuid 两入口统一；卡片网格 `auto-fill minmax(340px,1fr)`；死导入清理。
7. **插件口径统一走 features.yaml 专用清单（H2，用户决策 A1，二次修订）**：`enabled_plugins` 是部署级全平台启用契约，不承担「全局规则可用插件列表」语义——新增专用 key `global_rule_plugins`（与 `enabled_plugins` 同级，列表类型，空/未配置 = 不限制）。落地 = 删除集群子页硬编码 `['traceid','monitor']`，两入口表单（收敛后的共享 `PluginEntityFormModal` 单点）从 featuresStore 读取该清单过滤插件目录（`enabled_plugins` 仍作为平台层硬上限并行生效）；`backend/features.yaml` 默认发 `global_rule_plugins: [traceid, monitor]`——集群子页现状精确保留，主页面全局规则表单从全量收紧到这 2 个。后续调整清单只改 features.yaml，免改代码。

**不做（Non-Goals，另立项或待决策）**

- 查看体验增强（M5：真 Drawer、插件逐项折叠、编辑/发布出口）——结构性改造，同插件组 M4 先例另立项。
- 权限门控（只读角色隐藏写操作按钮）——待角色矩阵确认。
- 同集群同名唯一约束——后端约束变更涉及存量数据清洗，同插件组 L9 先例另立项。
- 发布确认「将创建新版本 v(N+1)」提示对全局规则开启——插件组 opt-in 先例是否扩大待决策。
- 删除引用检查——待确认 Edge 侧全局规则是否存在逐路由绑定。

## Impact

**Affected specs**（本变更 delta，全部 ADDED，不修改既有需求块）

- `global-rule-publish-status`（ADDED，新能力）
- `cluster-global-rules`（ADDED，删除警示与插件口径）
- `cluster-global-rules-component`（ADDED，表单收敛与状态区分）
- `global-rule-list-page`（ADDED，新能力：侧边栏主页面行为，含空态两分支）
- `cluster-plugin-configs-component`（ADDED，插件组集群子页加载失败态——A3 共享修的插件组半）
- `deployment-feature-config`（ADDED，新 key `global_rule_plugins`：校验/空语义/暴露兼容/单点 accessor）
- `config-version-management`（ADDED，版本弹窗资源名词表）

**Affected code**

- 后端：`app/schemas/cluster.py`（`GlobalRuleResponse` 补 `updated_at`/`pending_publish`/`last_publish_status`）、`app/models/cluster.py`（`GlobalRule.last_publish_status` 列）、`app/core/migrate.py`（`COLUMN_MIGRATIONS` 注册）、`app/api/v1/global_rules.py` 与 `app/api/v1/cluster_global_rules.py`（列表端点 pending 推导，复用 `edge_sync.derive_pending_publish`）、`app/core/features.py`（新 key `global_rule_plugins` 列表校验 + `get_global_rule_plugins()` 单点 accessor，`GET /system/features` 经 `get_features()` 自动暴露）、`backend/features.yaml`（新增 `global_rule_plugins: [traceid, monitor]`，**不动 `enabled_plugins`**）
- 前端：`src/views/GlobalRuleList.vue`、`src/views/clusters/ClusterGlobalRules.vue`、`src/views/clusters/ClusterPluginConfigs.vue`（插件组集群子页失败态 UI，A3）、`src/components/VersionManagementModal.vue`、`src/components/PublishConfirmModal.vue`（共享节点取数全量，A2）、`src/components/PluginEntityFormModal.vue`（`global_rule` 资源按清单过滤插件选择器，两入口单点）、features store（解析新 key）、`src/composables/useClusterUtils.ts`（删除确认 `extraWarning` 通用参数，向后兼容）、`src/composables/useClusterPluginEntity.ts`（loadItems 失败态契约，A3）、`src/composables/useClusterGlobalRules.ts`、`src/types/index.ts`
- 测试：新增 `backend/tests/test_global_rule_publish_status.py`（参照 `test_plugin_config_publish_status.py`）；features 配置校验用例（新 key 类型报错/空 = 不限制/暴露兼容）；前端组件测试更新（含两入口插件清单同源、插件组集群子页失败态、发布流共享回归）；`tests/test_security_guard.py` 无需变更（无新增端点）；合入前 PG 方言冒烟（约定 #31）；实页验收截图（约定 #51②）
