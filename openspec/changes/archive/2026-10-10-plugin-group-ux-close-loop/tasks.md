# plugin-group-ux-close-loop Tasks

## 1. 发布状态接线（H1，TDD）

- [x] 1.1 RED：新建 `backend/tests/test_plugin_config_publish_status.py`（参照 `test_upstream_publish_status.py`）——断言两个列表端点（`GET /clusters/{id}/plugin_configs`、`GET /api/v1/plugin_configs`）响应每条记录携带 `pending_publish`；编辑保存后 pending 为真；发布后 pending 为假；`current_version` 非空但版本删光时 pending 为 False 且不 TypeError（None 守卫）
- [x] 1.2 GREEN：`PluginConfigResponse` 补 `updated_at`（含 `isoformat()+'Z'` field_validator，同既有 `created_at`）/`pending_publish`/`last_publish_status` 字段（对齐 `UpstreamResponse` 单点注释形态，schemas/cluster.py:146-151）；两个列表端点经 `edge_sync.derive_pending_publish` + publish-map 回查推导（全局端点 `plugin_configs.py::list_all_plugin_configs` 与集群端点同口径，MUST NOT 各自实现推导逻辑）；全局端点既有内联 publish-map 查询换用 `load_publish_time_map` 单点
- [x] 1.3 RED：partial 持久化用例——发布存在失败节点后 `last_publish_status == 'partial'`，下次全部成功发布后清为 NULL
- [x] 1.4 GREEN：`PluginConfig` 模型补 `last_publish_status`（nullable String(16)）并注册 `COLUMN_MIGRATIONS`（#118）；确认 `publish_resource` 既有 `hasattr` 探测自动写回（edge_sync.py:213-214，预期零代码）
- [x] 1.5 RED：回滚语义用例——回滚后 pending 为真（onupdate 自然置位，pending 输入不特判）；且回滚后 `last_publish_status` 被清除（partial 不再掩盖待发布，D6）
- [x] 1.5b GREEN：`rollback_resource` 内 `hasattr(resource, "last_publish_status")` 探测清除（共享单点，upstream 与插件组两路径同回归，无此列资源不受影响）
- [x] 1.6 PG 方言冒烟：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（#31/#103）

## 2. 前端状态接线（H1 前端半）

- [x] 2.1 `src/types/index.ts` PluginConfig 类型补 `updated_at`/`pending_publish`/`last_publish_status`
- [x] 2.2 `PluginConfigList.vue` 卡片接入 `PublishStatusTag` 四态（未发布/待发布/⚠ vX·发布未完全生效/已发布 vX+时间），pending 依据后端字段
- [x] 2.3 集群子页 `ClusterPluginConfigs.vue` 同步接入（两端口径一致）
- [x] 2.4 保存成功 toast 对齐上游先例：「插件组已保存。配置尚未发布，需发布后才会在 Edge 节点生效」——**两条保存路径四处分支**：主页面 `PluginEntityFormModal`（:127/:130「已更新/已创建」）与集群子页 `useClusterPluginEntity`（:140/:143「已更新/已添加」）（决策 C）
- [x] 2.4b 保存成功后刷新列表，使「待发布」标签立即可见（两条路径一致）
- [x] 2.5 组件测试：四态渲染断言 + toast 文案断言

## 3. 删除前置引用检查（H4，TDD）

- [x] 3.1 RED：`GET /clusters/{id}/plugin_configs/{config_id}/references` 用例——被 N 条路由引用时返回 `{ name, referenced_by: [...] }`（含 route_id/route_name）；无引用返回空数组；畸形 `plugin_config_ids` JSON 按不含引用处理
- [x] 3.2 GREEN：把 PLG-07 引用遍历抽为模块级 helper（cluster_plugin_configs.py 内），删除守卫与新端点共用；helper 比对键 `edge_uuid`
- [x] 3.3 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补新端点采样（#19）
- [x] 3.4 RED：前端测试——引用非空时**不弹共享删除确认**，改 `useOverlayModal` 阻断提示（列出引用路由名，超 3 条折叠「等」；按钮仅「仅删除 Edge 记录」/「取消」），点「仅删除 Edge 记录」照常走共享 Edge-scope 删除进度流程；无引用时行为不变（既有共享确认全流程）（决策 A/B）
- [x] 3.5 GREEN：两页接入——主页面删除调用点（PluginConfigList.vue 直接调处）拉取引用后分流；集群子页在 `useClusterPluginEntity` 传入 core 的 deps 处包装（不改 `useClusterResourceCore` 本体）；守卫 400 的既有错误路径保持兜底

## 4. 表单修复（H2/H3/L10）

- [x] 4.1 RED：`PluginEntityFormModal` 组件测试——跨 Tab 校验失败时切回「基础配置」Tab 并出现警告提示；保存失败 toast 内容为后端 detail（非裸「保存失败」）；有未保存变更时关闭前出现确认
- [x] 4.2 GREEN：实现四处（`validateForm` 失败切 activeTab + warning；catch 走 `getApiErrorMessage`；dirty 保护对齐 `UpstreamFormModal` 先例且保存成功后先清 dirty 再关窗）

## 5. 文案与空态一致性（M2/M3/M5/M7/L3）

- [x] 5.1 M2：主列表筛选下拉「全部分组」→「全部集群分组」
- [x] 5.2 M3：路由表单弹窗插件组 Tab 空态文案改为「请先在左侧菜单「插件组」页面创建」；未发布卡片 `v0` → 「未发布」标签
- [x] 5.3 M7：`PluginSelector.vue` 空态文案「点击左侧插件添加到路由」→「点击左侧插件添加」（语境中性化）
- [x] 5.4 L3：主列表空态区分「暂无插件组（含创建按钮）」与「无匹配结果（含清空筛选按钮）」
- [x] 5.5 M5：`useClusterUtils` 发布确认参数化（可选资源名 + 新版本号），插件组调用点传入「发布插件组: {名称}」+「本次发布将创建新版本 v(N+1)」；其余资源调用点默认行为不变
- [x] 5.6 更新受影响组件测试断言

## 6. 进度日志状态值映射（L5）

- [x] 6.1 `useClusterUtils.handleResult` 显示层映射（**以 edge_sync 真实产出为准**）：逐节点 `success→成功`、`failed→失败`、`skipped→跳过`、`pending→执行中`（兜底）；顶层无活跃节点 `error/ok→失败/成功`；数据库腿 `success→成功`（用词与终态汇总既有映射对齐；仅展示层，不改 results 数据结构）
- [x] 6.2 更新 useClusterUtils 单测断言；按 #51④ 回归同域既有测试（至少 `useClusterUtils` + 插件组/上游/路由视图测试；内联实现点不动但需确认不受影响）

## 7. 验证与验收

- [x] 7.1 后端：`cd backend && uv run pytest`（全局隔离，#104 全量可跑）
- [x] 7.2 前端：`npx vue-tsc -b`（#27，必须构建模式）+ `npx vitest run`（已知 ~5 个时序 flake，判定前单文件重跑，#196）
- [x] 7.3 实页验收（#51②，Playwright 连 12345 实例）：主页面与集群子页各截图——①编辑已发布插件组→出现「待发布」；②发布→「已发布」+时间；③删除被引用插件组→出现阻断提示（引用路由清单 + 仅删除 Edge 记录/取消）；④新建跨 Tab 校验→自动切回基础配置；⑤发布/删除进度日志状态值中文显示；⑥partial 发布后回滚→状态正确显示「待发布」
- [x] 7.4 `openspec validate --strict` 由编排方执行（#152；本机 CLI 不可用，#194）
