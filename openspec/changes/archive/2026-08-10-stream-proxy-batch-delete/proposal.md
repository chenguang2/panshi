# Proposal: 四层代理卡片列表批量删除

## Why

四层代理页（`StreamProxyList.vue`）采用卡片网格布局，目前只有单删（逐卡片操作）。当卡片数量较多时（几十上百个 TCP/UDP/TLS/DNS 代理），逐个删除效率极低。本项目表格类页面（路由/上游/节点）已有成熟的批量删除模式（选择状态 + 批量按钮 + 确认弹窗 + 进度反馈），但卡片类页面尚无批量能力。

需要为卡片列表页补齐批量删除能力，与表格页交互对齐，同时适配卡片布局特性（批量管理模式 + 全选联动）。

## What Changes

**前端（四层代理卡片页）**：
- 页头新增「批量管理」按钮，点击进入/退出批量管理模式
- 批量模式下每张卡片右上角浮现圆形勾选框，点击卡片或勾选框选中（accent 边框高亮 + 勾选 ✓）
- 筛选栏浮现「全选当前分组」「全选当前筛选结果」链接，**toggle 语义**（已全选时再次点击取消全选）
- 底部浮现固定批量操作栏：`已选择 N 个 | 取消选择 | 批量删除 | 退出批量管理`
- 批量删除确认弹窗：聚合列出将删除的代理 + 数据库/Edge 双选项 + 红色警告（**不做名称确认**——与集群删除不同，四层代理单删本无名称确认步骤）
- 删除进度复用 `executeDeleteWithProgress`（`resourceKey` 批量模式逐条解析）

**后端**：
- 新增 `BatchDeleteStreamProxiesRequest`（继承 `DeleteClusterRequest`，额外 `proxy_ids`）
- 新增批量删除端点 `DELETE /clusters/{cluster_id}/stream-proxies`（逐条独立处理，单条失败不阻塞其余，复用 `delete_stream_proxy` 的单条逻辑）

## Capabilities

### New Capabilities
- `stream-proxy-batch-delete`: 四层代理卡片列表页的批量删除能力（批量管理模式、全选联动、批量确认与进度反馈），以及后端批量删除端点

### Modified Capabilities
- `stream-proxy-management`: 删除需求扩展为支持批量删除（新增批量删除场景，单删行为不变）

## Impact

- **后端**：`backend/app/schemas/cluster.py`（新增 `BatchDeleteStreamProxiesRequest`）、`backend/app/api/v1/cluster_stream_proxies.py`（新增批量删除端点）
- **前端**：`frontend/src/views/StreamProxyList.vue`（批量管理 UI + 状态）、`frontend/src/composables/useStreamProxyList.ts`（选择状态 `selectedProxyIds`/`batchMode`）、复用 `useClusterUtils` 的 `showDeleteConfirm`/`executeDeleteWithProgress`
- **测试**：后端 pytest（批量删除端点）、前端 Vitest（composable 选择状态与 toggle 逻辑）、Playwright E2E（可选）
- **不影响**：单删流程、发布/版本管理、DNS 与普通代理共用同一页面与端点（批量对两者均生效）
