# plugin-metadata-ux-close-loop Design

## Context

插件组已于 change `2026-10-10-plugin-group-ux-close-loop` 落地完整的发布状态闭环，本批所有基础设施已就绪且均为单点，**逐项核实如下**：

- `PluginMetadata` 模型的 `last_publish_status` 列：**2026-10-11 实施修正**——原判断有误（误读 models/cluster.py:180，该行属 PluginConfig），PluginMetadata 原本**无**此列；实施已按 PluginConfig/GlobalRule 先例补列并注册 `COLUMN_MIGRATIONS`（`("ps_plugin_metadata", "last_publish_status", "VARCHAR(16)")`）。`publish_resource` / `create_config_version` / `rollback_resource` 的能力探测写回随加列自动接入，共享层零改动不变。
- 共享 helper：`derive_pending_publish`（edge_sync.py:283，含 None 守卫）、`load_publish_time_map`（edge_sync.py:305）。
- `PublishStatusTag` 四态组件：`version` / `publishedAt` / `pending` / `lastPublishStatus` 四 prop；`pending` 缺省会强转 false，故消费方必须显式传 `pending`（或 `lastPublishStatus`）才激活四态（`pendingAware` 门控）。
- `VersionManagementModal` 出口条机制完整：`canPublish`（默认 false）→ 恢复成功显示出口条「已恢复到 v{N}（平台侧）。请发布以推送到 Edge 节点」+「立即发布恢复的配置」→ `emit('publish-requested')`（弹窗注释明说：弹窗自身不发发布请求，只通知调用方接自家发布链路）。**两个调用方均未接线**（未传 `can-publish`、未监听 `publish-requested`）。
- 两入口现状（已核实）：发布侧两处都已走 `PublishConfirmModal`（选节点）+ 共享发布链路（Tab 侧 `@confirm="handlePublishConfirm"` 已接线，PluginMetadata.vue:190-196）；独立页删除走共享 `executeDeleteWithProgress`；**Tab 删除**在 `showDeleteConfirm` 之后是 ~80 行手写进度弹窗（`showOverlayModal` 手搓，useClusterUtils.ts:806 有共享实现）。
- 状态展示现状：独立页 `PluginMetadataList.vue:52-58` badge + `PublishStatusTag` 双显、`:published-at="item.updated_at"`；Tab `PluginMetadata.vue` badge + `v{N} · 日期` 文本（同为 `updated_at`）。「v未发布」拼接 bug：独立页查看抽屉 :132、Tab 查看抽屉 :86。
- 后端两个列表端点均**无**发布时间回查与 pending 推导：`GET /clusters/{id}/plugin-metadata`（`cluster_plugin_metadata.py`，内联 dict 构建响应）与 `GET /api/v1/plugin_metadata`（`plugin_metadata.py`，跨集群聚合列表；**路由前缀是下划线 `plugin_metadata`**，注意与集群子页横线路由不同名）。
- **回滚/版本删除端点内联实现**（2026-10-11 评审发现）：`cluster_plugin_metadata.py:218-239` 回滚手搓（get_or_404 → 查 ConfigVersion → 赋 `config_data`/`current_version` → commit），全文件对共享 `rollback_resource` / `delete_config_version` **零引用**（约定 #18 违例）——漏共享单点的 partial 清除（插件组 change 的 D6 逻辑：回滚时 `last_publish_status` 置 NULL）；版本删除端点（:253-273）同为内联，但自带「无法删除当前版本」400 守卫、语义正确。

## Goals / Non-Goals

- **Goals**：恢复出口条接线（P0）；两入口状态四态单一表达 + 真实发布时间；删除进度收敛共享实现；「v未发布」修复。全部为接线与收敛，不新造机制。
- **Non-Goals**：见 proposal「不做」清单（布局形态合并、插件定义迁 YAML、发布确认参数化 opt-in、C5 文案批、独立页新增弹窗改造）。

## Decisions

### D1. 发布状态接线走既有单点，禁止本地推导

两个列表端点均经 `derive_pending_publish` + `load_publish_time_map` 回查推导，响应补三字段：`pending_publish`（推导）、`published_at`（回查，非 `updated_at`）、`last_publish_status`（序列化既有列）。跨集群端点的 publish-map 键位（cluster_id 维度）**对照 `plugin_configs.py::list_all_plugin_configs` 既有先例**实现同口径（全局端点已用 `load_publish_time_map` 单点）。前端 MUST NOT 本地推导 pending。测试参照 `test_plugin_config_publish_status.py` 结构。发布侧 `publish_resource` / `rollback_resource` 共享单点零改动——partial 写回、时间对齐、回滚清除均经既有能力探测自动生效，仅补回归断言。

### D2. 两入口状态单一表达 = `PublishStatusTag` 四态

- 独立页：删 badge 双显（:52-58 区域），`PublishStatusTag` 传 `version` / `publishedAt`（回查值）/ `pending` / `lastPublishStatus`，**MUST NOT 再传 `updated_at`**。
- Tab：badge + `v{N} · 日期` 文本整体替换为同一组件同参数。
- 判定顺序与四态语义（未发布 → ⚠ 部分失败 → 待发布 → 已发布 vX + 时间）由组件内既有逻辑承载，两页只是喂参，不复制判定。

### D3. Tab 删除进度收敛共享实现

`PluginMetadata.vue` 手写进度弹窗（~80 行）换 `executeDeleteWithProgress`：`showDeleteConfirm` 的确认与范围选择行为**保持不变**，仅其后半段（进度渲染 + 节点循环日志 + 终态汇总）交共享实现（`DeleteProgressOptions`：`title`/`apiEndpoint`/`deleteDb`/`deleteEdge`/`nodeIds`/`refreshFn`）。`PluginMetadata.delete.test.ts` 同步改造（现断言手写弹窗结构；mock 按 #43 URL 感知兜底）。独立页已是共享实现，不动。

### D4. 版本恢复出口条接线（P0）——调用方接自家发布链路

- 两个调用方传 `:can-publish="true"`，并新增 `@publish-requested` 处理：以当前版本弹窗上下文的资源（弹窗 props `resourceId`/`clusterId` 的调用侧镜像 ref）走各自既有发布链路（打开 `PublishConfirmModal` → 共享发布流程）。
- 发布成功后：刷新页面列表 + 使版本弹窗重载版本列表（经组件 ref 调用既有加载方法或重设触发 prop，**实施取最小改动**；不弹窗改共享层）。
- 出口条文案保留既有（「已恢复到 v{N}（平台侧）。请发布以推送到 Edge 节点」），文案语义已准确，不在本批改共享组件文案。
- 回滚经共享 `rollback_resource` 执行（评审发现的 #18 违例纠正，见 D6）：置 `current_version`（脏属性）触发 onupdate bump `updated_at` → 发布时间回查自然推导出「待发布」，partial 残留同步清除，与插件组语义一致（不特判回滚路径）。

### D5. 「v未发布」条件渲染修复

两处查看抽屉（`PluginMetadataList.vue:132`、`PluginMetadata.vue:86`）`v{{ x || '未发布' }}` 改为条件渲染：有版本显示 `v{N}`，无版本显示「未发布」灰态文本。

### D6. 回滚/版本删除端点收敛共享单点（约定 #18 纠正，用户确认）

- 回滚端点换 `rollback_resource(db, PluginMetadata, resource_type="plugin_metadata", resource_id=item.id, cluster_id=cluster_id, version=version, not_found_detail=..., restore_fn=...)`（签名已核：调用方自构响应体，保留既有 `{"message", "version"}` 形状）——共享单点的 partial 清除逻辑（插件组 change D6：`last_publish_status` 置 NULL）随之生效，修复「partial 后回滚显示 ⚠ 掩盖待发布」。
- 版本删除端点换 `delete_config_version` 共享单点（守卫语义不变：无法删除当前版本 400）。
- API 级「回滚到当前版本」为 no-op（`current_version` 同值不产生脏属性 → 无 UPDATE → `updated_at` 不动 → pending 不变）：不额外守卫（决策 2a），UI 层仅允许回滚非当前版本，spec 已标注 known behavior。

### D7. 验收必须落在真实页面（约定 #51②）

独立页与统一管理 Tab 各自实测截图：四态标签、真实发布时间、删除共享进度、恢复 → 出口条 → 立即发布全链路。

## Risks / Trade-offs

- **删除测试改造**：`PluginMetadata.delete.test.ts` 现断言手写弹窗结构，换共享流程后断言全改——工作量集中在测试侧，生产逻辑变薄。
- **跨集群端点 publish-map 键位**：对照 plugin_config 全局端点先例；若聚合键位有出入以该先例为准，MUST NOT 发明第二套键位。
- **出口条发布链路的弹窗叠层**：版本弹窗（Teleport body）之上再开发布进度——既有共享进度弹窗为全局单例（`progressTaskInFlight` 防并发），视觉叠层实测确认即可。
- **vitest 时序 flake**（约定 #196）：判定回归前先单文件重跑。

## Migration Plan

纯增量接线：无新端点、无共享层改动；新增一列 `ps_plugin_metadata.last_publish_status`（COLUMN_MIGRATIONS 通道，启动自动补列，约定 #118）。存量行 `pending_publish` 由推导即时计算，`published_at` 由回查即时计算，无数据回填。

**实施已落地的事实修正**（2026-10-11，fix-1 泳道）：① 补列 + 迁移注册（见 Context 修正）；② 回滚 restore_fn 取版本快照包装的内层 `config_data`（快照存发布载荷 `{"plugin_name","config_data"}` 包装——旧内联回滚把包装串整个塞回 `config_data`，系既有缺陷，已随之修复并用「回滚当前版本 no-op」用例钉死）；③ 回滚 404 文案随共享单点统一为「版本不存在」（全仓无旧文案引用）。

## Known Limitations（2026-10-11 评审确认，用户决策 2a/3a/4a）

以下边界为全资源既有共享语义，插件元数据域 **MUST NOT 特判**（已落 spec「插件元数据发布状态已知边界」需求）：

- **零活跃节点发布**：版本快照仍创建，但无节点实际生效；`last_publish_status` 清 NULL、`updated_at` 重钉发布时间戳 → 四态显示「已发布 vX」，仅发布响应报 no_nodes 错误（共享 skipped 语义，决策 3a）。
- **发布后新增节点不回填**：新节点无该元数据，pending=False 仍显示「已发布」（全资源既有局限，决策 4a）。
- **API 回滚到当前版本 = no-op**：见 D6 第三条（决策 2a）。

## Verified（2026-10-11 评审逐项核码确认，无洞）

- 回滚后 pending=True 断言成立：共享 rollback 置 `current_version`（脏属性 → onupdate bump `updated_at` > `published_at`）；发布侧 `flag_modified` 重钉 `updated_at=publish_ts` 防「相等误报」。
- 全节点失败也是 `'partial'`（`"partial" if fail_count else None`）→ ⚠ 态覆盖完整，无「全失败落空」。
- 出口条重置已有实现（`VersionManagementModal:270` `restoredVersion=null`；恢复成功 `:627/:658` 赋值）——modal 重开无陈旧出口条，实施确认即可。
- 删除历史版本不影响发布时间回查：当前版本不可删 → `max(created_at)` 恒指向当前版本行；回滚后删除原最新版本的 pending 推导自洽。
- 「v未发布」修复口径可靠：`current_version` 是实体列（非推导），两入口同源；跨集群端点 publish-map 按 `resource_id` 主键聚合，无跨集群碰撞。

## Open Questions

- 版本弹窗重载方式（ref 暴露 vs 触发 prop）实施时取最小改动，不阻塞方案审批。
