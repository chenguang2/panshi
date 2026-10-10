# Tasks: upstream-ux-close-loop

> 全程 TDD（约定 #16）：先写失败测试并验证失败，再最小实现。批次顺序即依赖顺序：1 → 2 → 3 → 4 → 5（回归）。

## 1. 止血：版本回滚与删除的真实语义（P0）

- [x] 1.1 （RED）为 `VersionManagementModal` 回滚语义写组件测试：按钮文案「恢复此版本配置（不会自动发布）」、点击出 `useOverlayModal` 确认（正文含「Edge 节点上的现有配置不受影响」）、确认后调既有回滚 API
- [x] 1.2 实现回滚文案 + 确认弹窗；成功提示改「已恢复到 vX（平台侧）。请发布以推送到 Edge 节点」
- [x] 1.3 回滚成功后弹窗内提供「立即发布恢复的配置」出口：弹窗 `emit('publish-requested')` + `canPublish` prop 控制显示（默认 false），本轮仅上游两处调用点接线（复用 `executePublish` 链路，含逐节点进度弹窗）
- [x] 1.4 （RED）删除历史版本确认测试：非当前版本点「删除此版本记录」出确认「删除后无法再回滚到 vX，确定删除？」；当前版本拦截保留
- [x] 1.5 实现删除确认；回归：版本管理弹窗为共享组件，跑全部资源域版本管理相关既有测试（约定 #51④）

## 2. 发布状态可见：后端推导 + 四态标签（P0 收尾）

- [x] 2.1 （RED）发布完成对齐测试：发布成功后资源 `updated_at == 本次发布时间戳`（同事务），`pending_publish` 推导为假；编辑/回滚后推导为真；对齐在 `create_config_version` 单点实现（`hasattr(entity, "updated_at")` 守卫；显式赋值优先于 onupdate，约定 #18）
- [x] 2.2 实现 D1 时间对齐；两个上游列表端点（`upstreams.py`/`cluster_upstreams.py`）经共享 helper 输出 `pending_publish`（判定顺序：未发布→部分失败→待发布→已发布；published_at 查无——版本历史删光——恒 False，不对 None 比较），后端测试覆盖四态 + 版本删光守卫
- [x] 2.3 （RED）`Upstream.last_publish_status` 列测试；注册 `COLUMN_MIGRATIONS`（约定 #118）；`publish_resource` 以 `hasattr` 探测写回 `'partial'`/清 NULL（D2）
- [x] 2.4 合入前跑 PG 方言冒烟：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（约定 #31/#103）
- [x] 2.5 （RED）`PublishStatusTag` 四态组件测试：未发布（灰）/待发布（橙，显式 prop 传入，禁止由「有版本无时间」隐式推导；未接入资源保留原「未同步」分支）/已发布 vX+时间（绿，无时间时不带）/⚠ vX·发布未完全生效（橙红，部分或全部失败均落此态）
- [x] 2.6 全局页接入：发布状态列（合并版本列、状态含最近发布时间）、移除创建时间列与全部前端 sorter（D6）、协议列未配置显示 `—`、`ewma` 展示名统一「延迟最小」（D7）；同步更新 `UpstreamList.test.ts`
- [x] 2.7 集群子页接入 `pending_publish`（PublishStatusTag 消费新字段）；同步更新 `ClusterUpstreams.test.ts`

## 3. 保存后发布引导（P0-2）

- [x] 3.1 （RED）表单保存成功测试：三处（全局表单/集群内联表单/复制保存）toast 统一为「已保存。配置尚未发布，需发布后才会在 Edge 节点生效」，且出 `useOverlayModal` 引导「[稍后/立即发布]」
- [x] 3.2 实现引导弹窗；「立即发布」接 `PublishConfirmModal` → `executePublish`（D5）；不自动发布
- [x] 3.3 「发布」上浮为全局页行内主按钮，⋯ 菜单收敛为 编辑/版本管理/复制/删除（与 `upstream-management` 主 spec 既有「回滚不出现在菜单」约束并存）
- [x] 3.4 发布进度弹窗 partial/失败时增「重新发布」出口（D10，回填同一 endpoint）；回归 `useClusterUtils` 既有用例

## 4. 一致性与体验打磨（P1/P2）

- [x] 4.1 集群子页勾选 1 行同步 `cluster.selectedUpstream` + 选中行高亮（接线对齐 `cluster-upstreams-composable` 主 spec 既有要求，D8；`rows[0]` 存在性守卫——跨页勾选 rows 可能只含当前页行，缺失时不写单选、按钮维持禁用）；测试：勾选 1 行后「编辑上游/发布/版本管理」可用且不再误报「请先选择一个上游」
- [x] 4.2 集群子页补「目标节点」列（target-tag，前 2 个 + `+N` 折叠；对齐 `cluster-upstreams-component` 主 spec 既有要求）
- [x] 4.3 表单校验失败自动切换到首个出错 Tab（全局表单 + 集群内联表单两处；Tab 级即可，不强制展开折叠 section）；测试：高级配置 Tab 内字段校验失败时保存，Tab 自动切换且错误可见
- [x] 4.4 表单误关保护：dirty 检测 + × /取消时 `useOverlayModal`「更改尚未保存，确定放弃？」（两套表单都补，D9）
- [x] 4.5 高级配置 hint + 中文占位：chash Key hint（header 填请求头名/cookie 填 Cookie 名）、超时三项 hint + 占位改「如 6」、权重错误文案「权重需为 1-100 的整数」
- [x] 4.6 空状态引导：无上游时 CTA「新建上游」；筛选后为空时「清除筛选」（区分两种空）
- [x] 4.7 删除确认 scope 风险一句话：不勾「从 Edge 节点中删除」时提示节点将继续运行该上游（共享弹窗 `useClusterUtils`，文案属全站口径，改动后跑发布/删除弹窗既有测试）
- [x] 4.8 保存按钮/成功文案统一：集群子页「编辑→保存 / 新建→创建」与全局「保存」二选一对齐（取「保存」），成功文案随 3.1 统一

## 5. 回归与验收

- [x] 5.1 后端：`cd backend && uv run pytest -k "upstream or publish or version"` 全绿；受影响域既有用例无回归（约定 #51④：改行为语义必须覆盖同域既有测试）
- [x] 5.2 前端：`npx vue-tsc -b` + `npx vitest run` 全绿（`UpstreamList`/`ClusterUpstreams`/`UpstreamFormModal`/`useClusterUpstreams`/`PublishStatusTag`/`VersionManagementModal` 相关用例）
- [x] 5.3 真实页面验收（约定 #51②）：开发实例 localhost:12345 上逐项截图——全局列表四态标签、保存引导弹窗、回滚确认与发布出口、集群子页 targets 列与选中高亮；不启停服务（约定 #8）
- [x] 5.4 tasks.md 逐项打勾，准备归档
