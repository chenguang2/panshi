# Proposal: upstream-ux-close-loop

## Why

上游管理模块 UX 评审（2026-10-09，tag `pre-upstream-ux-v1.51.0` 前基线）发现「编辑→发布→确认生效」核心闭环在前端表达上是断的，构成三条 P0：

1. **全局「上游管理」列表看不到发布状态**——版本列仅裸文本 `v2`/`未发布`，无发布时间；后端 `GET /upstreams` 已回填 `published_at`、`PublishStatusTag` 组件已存在，只差接线，用户无法回答「哪个上游是旧的」。
2. **保存成功后无任何「需发布」引导**——表单 toast 只报「上游已更新/已创建/已添加」后直接关窗，「发布」藏在 ⋯ 下拉第三项，新用户误以为保存即生效。
3. **版本回滚只切平台库、不推送 Edge，但 UI 暗示「已生效」**——`rollback_resource` 无任何 EdgeClient 调用（已核实），按钮却叫「切换到此版本」、成功提示绿色通过；故障时刻回滚的运维会认定线上已恢复，实际流量仍打在坏配置上。**全模块最危险的心理模型错位。**
4. **删除历史版本无二次确认**——版本历史是回滚唯一锚点，一键不可逆。

另有 P1 一致性问题：全局页前端假排序（只排当前页）、EWMA 一值两名（EWMA/延迟最小）、集群子页隐形选中（勾选 1 行后点「编辑」报「请先选择一个上游」）、集群子页缺目标节点列、校验失败不跨 Tab 跳转、表单误关无保护、发布部分成功在列表层不留痕迹（PublishStatusTag「未同步」分支因 published_at 恒有值而不可达）。`cluster-upstreams-component` spec 本就要求 targets 列、`cluster-upstreams-composable` spec 已规定勾选 1 行须同步 `selectedUpstream`——两处均为代码未达 spec，本次一并对齐。

## What Changes

- **止血（P0）**：版本回滚文案改为「恢复此版本配置（不会自动发布）」+ 确认弹窗 + 恢复后「立即发布」出口；删除历史版本加 `useOverlayModal` 确认；表单保存 toast 统一为「已保存。配置尚未发布…」+ 保存后发布引导弹窗（复用 `PublishConfirmModal` → `executePublish` 链路）。
- **状态可见**：后端 `create_config_version` 单点对齐资源 `updated_at` 与发布时间戳（`hasattr` 守卫，无该列的模型如 StreamProxy/SslCertificate 跳过），两个上游列表端点经共享 helper 推导 `pending_publish` 布尔（`published_at` 查无——如版本历史被删光——时恒为 False，不崩溃）；`Upstream` 新增 `last_publish_status` 列持久化 partial 发布结果（全失败也记 partial）；`PublishStatusTag` 扩展四态（未发布/待发布/已发布/⚠ 发布未完全生效；pending 为显式 prop，禁止由「有版本无时间」隐式推导），全局列表接入状态列（合并版本列、以最近发布时间替代创建时间、移除前端假排序、协议列去假默认）。
- **一致性收敛**：EWMA 展示统一为「延迟最小」；集群子页勾选 1 行同步单选 + 行高亮；集群子页补目标节点列；表单校验失败自动切换到首个出错 Tab；保存按钮/成功文案三处统一。
- **体验打磨**：表单误关保护；高级配置中文占位与概念 hint；空状态区分「从未创建/筛选为空」并给行动出口；删除确认补「不勾选 Edge 节点时节点继续运行该上游」风险一句话；发布失败弹窗增「重试」出口；权重校验文案说明规则；「发布」上浮为行内主按钮。

## Capabilities

### Modified

- `upstream-management`：筛选栏 EWMA 展示名统一；表格列改版（发布状态列/协议列/去假排序）；行内发布入口与 ⋯ 菜单重排；新增保存后发布引导与空状态引导需求
- `cluster-upstreams-component`：表格列补 targets 与发布状态；勾选同步单选与行高亮；新增集群内表单交互需求（保存语义/校验切 Tab/误关保护/hint）

### Added

- `config-version-management`：共享版本管理弹窗的回滚语义（恢复不自动发布、确认弹窗、恢复后发布出口）与删除版本确认——对全部 8 类使用该弹窗的资源类型一致生效
- `upstream-publish-status`：列表响应 `pending_publish` 推导语义、partial 发布结果持久化、`PublishStatusTag` 四态模型

## Non-Goals（本轮不做，待用户裁定后另立change）

- 发布状态作为筛选维度 + 计数统计徽标（评审 B5⑲）
- 发布状态标签点击下钻版本管理弹窗（评审 B5⑳）
- 健康检查启用状态列标识（评审 B5㉑；不引入 Edge 侧实时健康数据）
- 集群子页表单与 `UpstreamFormModal` 的组件合并（评审 B3⑫ 建议，改动面大，本轮仅按行为规格使两套表单达标，合并另立项）
- Edge 侧实时健康数据接入（观测域职责，越界）
- 发布中的行级「发布中…」遮罩（发布为模态流程，遮挡有限；不做按资源粒度的锁改造）
- `upstream` 主 spec「删除 SHALL 同步 Edge」与实现（可选 scope：可仅删平台记录）的既有失真——本 change 仅以删除确认文案显式化 scope 语义，主 spec 修正另立项

## Impact

- **后端**：`backend/app/services/edge_sync.py`（`create_config_version` 单点对齐 `updated_at`——hasattr 守卫；partial 状态写回——对有该属性的模型生效，不复制逐资源实现）；`backend/app/api/v1/upstreams.py`、`cluster_upstreams.py`（经共享 helper 推导 `pending_publish` + 透传 `last_publish_status`）；`backend/app/models/cluster.py`（`Upstream.last_publish_status` 新列，须注册 `COLUMN_MIGRATIONS`）
- **前端**：`UpstreamList.vue`（状态列/协议列/去 sorter/行内发布按钮/空状态/菜单重排）、`ClusterUpstreams.vue`（targets 列/勾选同步+高亮/表单交互）、`UpstreamFormModal.vue`（保存引导/误关保护/hint/校验切 Tab）、`useClusterUpstreams.ts`（同上内联表单部分）、`PublishStatusTag.vue`（pending/部分失败态）、`VersionManagementModal.vue`（回滚文案/确认/发布出口/删除确认）、`useClusterUtils.ts`（发布失败重试出口、删除 scope 风险文案）
- **测试**：后端新增发布状态推导/partial 持久化用例 + 版本弹窗共享语义回归 + PG 方言冒烟（新列触发约定 #31）；前端 `UpstreamList.test.ts`、`ClusterUpstreams.test.ts`、`UpstreamFormModal.test.ts`、`useClusterUpstreams.test.ts` 同步更新；`npx vue-tsc -b` + vitest
- **风险**：`VersionManagementModal` 为共享组件，回滚文案/确认改动对 8 类资源生效——回滚不推 Edge 是全部资源的共同真实语义，方向正确，但回归范围必须覆盖其他资源域的版本管理用例（约定 #51④）
