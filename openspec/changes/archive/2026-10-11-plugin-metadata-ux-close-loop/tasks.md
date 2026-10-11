# plugin-metadata-ux-close-loop Tasks

> 推进方式：按节推进，逐项勾选。所有新行为先写失败测试（RED）验证失败，再最小实现（GREEN），约定 #16。

## 1. 后端发布状态接线

- [x] 1.1 RED：新建 `backend/tests/test_plugin_metadata_publish_status.py`（参照 `test_plugin_config_publish_status.py` 结构；RED 实测 6 failed / 3 passed，9 用例）：
  - 两个列表端点（`GET /clusters/{id}/plugin-metadata`、`GET /api/v1/plugin_metadata`，**注意跨集群路由为下划线**）响应含 `pending_publish` / `published_at` / `last_publish_status`；
  - 新建（未发布）→ `pending_publish=False`、`published_at=None`；编辑配置后 → `pending_publish=True`；发布后 → `False` + `published_at` 为真实发布时间（发布用假节点 id 触发版本创建、不触 Edge，约定 #141）；版本删光 → 全 None 守卫不 500；
  - 回滚后 → `pending_publish=True` 且 `last_publish_status` 清 NULL（**RED 驱动项**：现回滚端点内联实现漏 partial 清除，该断言先红后绿，驱动 1.2 的共享单点收敛）；
  - API 回滚到当前版本 → no-op（pending 与状态不变，known behavior 回归钉，决策 2a）；
  - partial 发布后 → `last_publish_status='partial'`（共享单点 `publish_resource` 回归断言）；
  - 注：发布断言对象是**列表状态**而非发布响应——假节点 id（#141）触发 no_nodes_status=error，不影响列表断言。
- [x] 1.2 GREEN：两个列表端点经 `derive_pending_publish` + `load_publish_time_map` 回查推导；响应补三字段（`last_publish_status` 为**新补列**序列化）；跨集群端点 publish-map 键位对照 `plugin_configs.py::list_all_plugin_configs` 先例；两端口径单点，禁止本地第二套推导。**回滚端点换共享 `rollback_resource`**（restore_fn 取快照包装内层 `config_data`，响应形状不变）、**版本删除端点换共享 `delete_config_version`**（守卫语义不变：无法删除当前版本 400）——移除内联实现（约定 #18，design D6）。✅ 含偏差修正：PluginMetadata 补列 + COLUMN_MIGRATIONS 注册（design Context 修正）；restore_fn 修复旧内联回滚塞包装串的既有缺陷。
- [x] 1.3 PG 方言冒烟：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（约定 #31/#103）——✅ 8 passed（文件现为 8 用例，第 8 个系他变更既有新增）。

## 2. 状态展示收敛（前端，两入口）

- [x] 2.1 RED：组件测试断言两入口四态单一表达——`PublishStatusTag` 收到 `publishedAt`（回查值）/ `pending` / `lastPublishStatus`；无 badge+Tag 双显（独立页）、无 `v{N} · 日期` 文本（Tab）；`publishedAt` 不传 `updated_at`。（✅ RED 实测 13 failed / 13 passed）
- [x] 2.2 GREEN：`PluginMetadataList.vue` 删 badge 双显（:52-58 区域）、修正 `:published-at` 传参；`PluginMetadata.vue` badge + 文本替换为同参数 `PublishStatusTag`；`types/index.ts` 补 `pending_publish` / `published_at` / `last_publish_status` 字段。（✅ 另含 `ConfiguredPlugin extends PluginMetadata` 类型收敛与死 CSS/导入清理）
- [x] 2.3 RED/GREEN：「v未发布」修复（`PluginMetadataList.vue:132`、`PluginMetadata.vue:86`）——有版本显示 `v{N}`，无版本显示「未发布」灰态；测试断言不出现「v未发布」字符串。（✅）

## 3. 删除进度统一（约定 #51③）

- [x] 3.1 RED：改造 `PluginMetadata.delete.test.ts`——断言走共享 `executeDeleteWithProgress` 流程（mock 按 #43 URL 感知兜底，禁调用顺序链）。（✅ spy 包装真实实现断言入参，既有 route 标注用例保留）
- [x] 3.2 GREEN：`PluginMetadata.vue` 删手写 ~80 行进度实现，`showDeleteConfirm` 输出喂 `executeDeleteWithProgress`（`title`/`apiEndpoint`/`deleteDb`/`deleteEdge`/`nodeIds`/`refreshFn`）；确认弹窗行为不变。（✅ viewingPlugin 清理挪 afterDelete，refreshFn 保留双刷）
- [x] 3.3 回归（约定 #51④）：`PluginMetadataList.test.ts` + `PluginMetadata.delete.test.ts` + `PluginMetadata.publish.test.ts` + useClusterUtils 相关单测全绿。（✅ 7 files / 102 tests passed，含 VersionManagementModal/deleteGuard 相邻域回归）

## 4. 版本恢复出口条接线（P0）

- [x] 4.1 RED：两入口测试——`can-publish` 已传；恢复成功后出口条可见（含「立即发布恢复的配置」）；点击出口条触发各自既有发布链路（断言 `PublishConfirmModal` 打开且目标资源正确）。（✅ RED 实测 canPublish undefined、出口条 confirm 未触发）
- [x] 4.2 GREEN：`PluginMetadataList.vue` / `PluginMetadata.vue` 传 `:can-publish="true"`、监听 `@publish-requested`，以版本弹窗上下文资源复用既有 `PublishConfirmModal` + 共享发布流程；发布成功后刷新页面列表并使版本弹窗重载版本列表（最小改动）。（✅ 出口条触发时先关版本弹窗让位确认弹窗（UpstreamList 先例），成功后重开重载；Tab 侧 clusterId watcher 复位防脏上下文）
- [x] 4.3 确认出口条文案保留既有实现（「已恢复到 v{N}（平台侧）。请发布以推送到 Edge 节点」），不改共享组件。（✅ `VersionManagementModal.vue` 零改动）

## 5. 验证与验收

- [x] 5.1 后端全量 `cd backend && uv run pytest`（全局 DB 隔离已就绪，约定 #104）。（✅ 2415 passed / 2 failed——`test_clickhouse_client`（本地运行态 clickhouse.yaml host 漂移）与 `TestRepoFeaturesYaml`（features.yaml 既有漂移）经 stash 单跑实证 **HEAD 既有环境性失败**，与本变更无关）
- [x] 5.2 前端 `npx vue-tsc -b`（约定 #27）+ `npx vitest run`（时序 flake 先单文件重跑判定，约定 #196）。（✅ vue-tsc -b 零错误；vitest 全量 134 files / 1504 tests passed，零 flake）
- [x] 5.3 实页验收（约定 #51②，Playwright 连 localhost:12345 截图）——独立页与统一管理 Tab 各验：（✅ 断言 11/11 + Tab 删除全流程；截图 `/tmp/opencode/pmmc-shots/01-12`；测试数据已 API 双范围清理（DB+Edge）。注：partial 态需真实失败节点未在实页复现（组件测试已覆盖）；四态标签宽度适配的视觉终判留截图人工复核）
  - 四态标签正确：未发布 → 编辑后「待发布」→ 发布后「已发布 vX + 真实发布时间」（非编辑时间）；
  - 查看抽屉无「v未发布」；
  - 删除走共享进度弹窗（Tab）；
  - 恢复旧版本 → 出口条出现 → 立即发布 → 发布进度 → 版本弹窗列表刷新；
  - Tab 双栏卡片中四态标签（含时间）宽度适配，不换行错位。
- [x] 5.4 `openspec` 工件一致性自检（CLI 不可用，约定 #194：delta MODIFIED 块与主 spec 现文逐字对齐）。（✅ MODIFIED×3 标题均在主 spec、ADDED×1 + 新能力×5 无碰撞；基线为本会话 sync 后现文，期间无其他变更并入）
