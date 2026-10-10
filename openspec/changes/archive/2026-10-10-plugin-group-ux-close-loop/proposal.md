# plugin-group-ux-close-loop Proposal

## Why

插件组模块 UX 评审（2026-10-10，评审报告见会话记录）发现：模块骨架健康（共享发布/删除弹窗、后端引用删除守卫 PLG-07、四态 `PublishStatusTag` 组件、双模式编辑器均在），但**核心缺口是插件组没接上平台已有的能力**：

- **保存 ≠ 生效完全不可感知**（H1）：编辑已发布插件组并保存后，卡片仍显示「已发布 v3」；回滚后同样失真。上游资源已落地「保存→待发布→发布→已发布」闭环（change `2026-10-09-upstream-ux-close-loop`），插件组未接线。
- **跨 Tab 校验静默失败**（H2）：新建时停留在「插件配置」Tab 点「创建」，名称/集群校验错误元素在隐藏的「基础配置」Tab 里，按钮点了没任何反应。
- **保存失败只提示「保存失败」**（H3）：不透出后端 detail（同能力的集群 Tab 实现 `useClusterPluginEntity` 已正确处理）。
- **删除确认不展示「被路由引用」信息**（H4）：后端 PLG-07 守卫文案很好，但用户体验是「先答应再被告知不行」；只勾「Edge 节点」还会留下平台侧孤记录。

另有一批低成本文案/状态一致性缺陷顺带修复（M2/M3/M5/M7/L5/L10 等），修复路径均为「接线/对齐先例」而非新造。

## What Changes

**P0（本期核心）**

1. **发布状态接线（H1）**：后端两个列表端点统一输出 `pending_publish`（复用 `edge_sync.derive_pending_publish` 单点；全局端点既有内联 publish-map 回查换用 `load_publish_time_map` 单点）；`PluginConfig` 补 `last_publish_status` 列（`publish_resource` 已有 `hasattr` 能力探测，加列即自动接入）；前端 `PluginConfigList.vue` 与集群子页 `ClusterPluginConfigs.vue` 接入 `PublishStatusTag` 四态；两条保存路径（主页面表单 + 集群子页表单）的成功 toast 均对齐上游先例文案（「配置尚未发布，需发布后才会在 Edge 节点生效」）。
2. **表单修复（H2/H3/L10）**：`PluginEntityFormModal` 校验失败自动切回「基础配置」Tab 并提示；保存失败经 `getApiErrorMessage` 透出后端原因；补误关 dirty 保护（对齐 `UpstreamFormModal` 先例）。
3. **删除前置引用检查（H4）**：把 PLG-07 引用检查抽为共享 helper，新增只读端点 `GET /clusters/{id}/plugin_configs/{config_id}/references`；被引用时**不弹共享删除确认**，改经 `useOverlayModal` 阻断式提示（列出引用路由，仅提供「仅删除 Edge 记录」/「取消」）——零共享弹窗层改动；主页面与集群子页均接入（集群子页在 `useClusterPluginEntity` 的 deps 注入点包装，不改 core 本体）。

**P1（顺带，低风险）**

4. 发布确认弹窗标题带资源名 + 「将创建新版本 v(N+1)」说明（M5）。
5. 文案与空态一致性（M2「全部集群分组」、M3 路由关联空态指路与 v0→「未发布」、M7 PluginSelector 空态中性化、L3 列表空态行动引导/清除筛选）。
6. 发布/删除进度日志状态值中文映射（L5，改 `useClusterUtils` 共享层；映射取值以 edge_sync 真实产出为准——逐节点 `success`/`failed`/`skipped`/`pending`，需按约定 #51④ 回归同域既有测试）。
7. 回滚清除 `last_publish_status`：`rollback_resource` 共享单点内 `hasattr` 能力探测清除——partial 后回滚不再以「发布未完全生效」掩盖「待发布」（用户决策 D：纳入）；无此列资源不受影响，upstream 同病同修。

**不做（Non-Goals，另立项或搁置）**

- 集群子页与主页面双实现收敛（M1）——结构性重构，单独立项（同 upstream 先例 D9 处理方式）。
- 查看抽屉增强（M4）、卡片操作区收纳（M6）。
- 权限门控补齐（M8）——需先确认「有路由权限但无 plugin_groups 权限」的角色矩阵是否存在。
- 插件组名称唯一性约束（L9）——后端约束变更涉及存量数据清洗，另立项。
- L1/L2/L4/L6/L7/L8——低优先视觉打磨，随 M1 收敛一并处理。

## Impact

**Affected specs**（本变更 delta）

- `plugin-config-publish-status`（ADDED，新能力）
- `plugin-config-delete-reference-check`（ADDED，新能力）
- `cluster-plugin-configs-component`（ADDED，表单行为与文案）
- `plugin-selector-ux`（ADDED，空态文案）

**Affected code**

- 后端：`app/schemas/cluster.py`（`PluginConfigResponse` 补 `updated_at`（含 `isoformat()+'Z'` validator，同既有 `created_at`）/`pending_publish`/`last_publish_status`）、`app/models/cluster.py`（`PluginConfig.last_publish_status` 列 + `COLUMN_MIGRATIONS` 注册）、`app/services/edge_sync.py`（`rollback_resource` 能力探测清除 `last_publish_status`）、`app/api/v1/cluster_plugin_configs.py`（两列表端点 pending 推导、引用检查 helper、references 端点）、`app/api/v1/plugin_configs.py`（全局列表端点同口径；内联 publish-map 回查换用 `load_publish_time_map` 单点）
- 前端：`src/views/PluginConfigList.vue`、`src/views/clusters/ClusterPluginConfigs.vue`、`src/components/PluginEntityFormModal.vue`、`src/components/PluginSelector.vue`、`src/composables/useClusterUtils.ts`（发布确认标题参数化 + 状态值映射，向后兼容）、`src/composables/useClusterPluginEntity.ts`（保存 toast + 删除前置检查 deps 包装点）、`src/types/index.ts`
- 测试：新增 `backend/tests/test_plugin_config_publish_status.py`、references 端点测试；前端组件测试更新；`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补新端点采样（约定 #19）
