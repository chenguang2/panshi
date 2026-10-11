# plugin-metadata-ux-close-loop Proposal

## Why

插件元数据的两个入口（独立页 `PluginMetadataList.vue` 与统一管理 Tab `PluginMetadata.vue`）行为契约已经漂移，且存在一个 P0 级功能断链：

- **P0 版本恢复是死胡同**：`VersionManagementModal` 的 `canPublish` 出口条机制完整存在（恢复成功 → 「立即发布恢复的配置」→ `emit('publish-requested')`），但两个调用方都没接线——恢复旧版本后用户无发布出口；且回滚端点只改平台侧、Edge 仍运行旧版本，界面无「需发布才生效」提示（平台-Edge 静默不一致风险）。
- **状态展示三处表达不一**：独立页 badge + `PublishStatusTag` 双显；Tab 是 badge + `vN · 日期` 文本（第三种表达）；且两处都把 `updated_at`（最后编辑时间）冒充发布时间——后端两个列表端点均未做发布时间回查。
- **删除进度手写重复实现**：Tab 内 ~80 行手写进度弹窗（`showOverlayModal` 手搓），未走共享 `executeDeleteWithProgress`（违反关键约定 #51③）。
- **「v未发布」渲染 bug**：两处查看抽屉以 `v{{ x || '未发布' }}` 拼接，实际渲染出「v未发布」。
- **回滚/版本删除端点绕过共享单点**：`POST .../rollback/{version}` 内联手搓（违反约定 #18），漏 D6 的 partial 清除——partial 发布失败后回滚显示「⚠ 发布未完全生效」而非「待发布」，掩盖重新发布提示；`DELETE .../versions/{version_id}` 同为内联实现。

基础设施已就绪且均为单点（`derive_pending_publish` / `load_publish_time_map` 共享 helper、出口条机制、共享删除/发布流程），本批为**接线 + 收敛**：无新端点、无共享层改动；模型侧给 `PluginMetadata` 补 `last_publish_status` 列（2026-10-11 实施修正：原 design 误读 models/cluster.py:180——该行属 PluginConfig，PluginMetadata 原本无此列；已按 PluginConfig/GlobalRule 先例补列并注册 COLUMN_MIGRATIONS）。

## What Changes

1. **（P0）版本恢复出口条接线**：两个调用方传 `can-publish` 并处理 `@publish-requested`，复用各自既有发布链路（`PublishConfirmModal` + 共享发布流程）；恢复 → 发布一气呵成，消除「平台已恢复、Edge 未生效」的无提示窗口。
2. **发布状态接线（后端）**：两个列表端点（`GET /clusters/{id}/plugin-metadata`、`GET /api/v1/plugin_metadata`）经共享 helper 推导 `pending_publish` 并回查真实 `published_at`；响应补 `pending_publish` / `published_at` / `last_publish_status`（`last_publish_status` 为新补列的序列化）。
3. **状态展示收敛（前端）**：两入口统一为 `PublishStatusTag` 四态单一表达（未发布 / 待发布 / ⚠ 发布未完全生效 / 已发布 vX + 真实发布时间）；删除 badge 双显与 `vN · 日期` 文本；`publishedAt` 停止传 `updated_at`。
4. **删除进度统一**：Tab 手写 ~80 行进度实现换共享 `executeDeleteWithProgress`（`showDeleteConfirm` 确认行为不变）。
5. **「v未发布」修复**：两处查看抽屉未发布时显示「未发布」灰态。
6. **（#18 纠正）回滚/版本删除端点收敛共享单点**：回滚端点换共享 `rollback_resource`（随之获得共享单点的 partial 清除——partial 后回滚正确显示「待发布」）；版本删除端点换共享 `delete_config_version`（守卫语义不变：无法删除当前版本 400，消除内联复制）。

## Impact

**Affected specs**：
- `plugin-metadata-management`（MODIFIED：卡片状态展示、查看详情版本文案、版本管理出口条；ADDED：统一管理 Tab 行为契约一致）
- `plugin-metadata-publish-status`（ADDED，新能力：发布状态推导 / 四态展示 / 部分失败状态）

**Affected code**：
- 后端：`cluster_plugin_metadata.py`（两列表端点回查 + 回滚/版本删除端点收敛共享单点）、`plugin_metadata.py`（跨集群列表回查）、`models/cluster.py` + `core/migrate.py`（补列注册）+ 新测试文件
- 前端：`PluginMetadataList.vue`、`PluginMetadata.vue`、`types/index.ts` + 既有组件测试改造

**不做（Non-Goals，用户已决策或未批准）**：
- 两入口布局形态合并（卡片网格 vs 双栏，各自服务不同任务，仅统一行为契约）
- 插件定义迁 YAML（维持 Python 配置 `plugin_definitions.py`，用户决策 2）
- 发布确认弹窗资源名/版本号说明参数化（插件组已做的 opt-in，本批不开启）
- 表单错误提示 detail 透出等 C5 类文案优化（未列入本批批准范围）
- 独立页新增弹窗的插件发现体验改造（双栏模式吸收）
