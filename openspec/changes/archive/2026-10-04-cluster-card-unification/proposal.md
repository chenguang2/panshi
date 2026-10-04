# Proposal: cluster-card-unification

## Why

同一张集群卡片存在**三份各自漂移的拷贝**（集群管理 ClusterList 一份、统一管理 CentralList 分组/未分组两份）：统一管理**路径徽章缺失**（经中继/直连，功能缺失非仅样式）、副标题同位置内容源不同（`description` vs `集群标识: name`）、`.cl-card*` CSS 两份近似但独立演化 + inline style 混入。用户报「集群管理的卡片和统一管理的集群卡片，样式没有统一」。

## What Changes

- 新建共享组件 `frontend/src/components/ClusterCard.vue`（集群卡片解剖**唯一实现**，258 行）：props `cluster` + `routeBadge`（`{label, cls} | null`，页面用自家 relay 数据算好传入，组件内不发请求）；slots `topbar`/`actions`/`footer` 注入页面差异；卡片解剖样式（`.cl-card*` 族）只存在于组件内
- 统一管理补齐路径徽章（此前完全缺失）；CentralList 徽章经 watchEffect 惰性拉取（features 未加载短路不发请求）
- 副标题**回退式二显**：`description` 优先 → 无 description 时回退「集群标识: {name}」（用户拍板）
- 统一管理统计格 6 格 @click 最大化 → **7 格 router-link 跳转**（与集群管理一致，对齐 `cluster-stat-links` 主 spec 既有要求；最大化入口保留在 topbar 按钮）
- 卡片顶栏删除「#数字ID」尾注（全 UI 唯一 id 露出面，自解释失败的悬空数字）：数字 ID 改经卡片标题 hover tooltip 露出（`集群名 · ID: N`，无展示名回退 name）
- 死代码清理：`maximizeAndSwitchTab` 删除；源码守卫 `ClusterCard.source.test.ts` 钉死「两页 import、route-badge 接线、不再内联解剖、拷贝收敛、inline style 清除」

## Capabilities

### Modified

- `cluster-card-grid`：新增「集群卡片唯一实现（ClusterCard 组件）」需求（组件契约：props/slots/样式单点/ID tooltip）
- `cluster-list-page`：「Cluster card displays key information」补共享组件渲染与 ID tooltip 场景

### 未动（说明）

- `cluster-stat-links`：主 spec 已要求 7 项统计可点击链接，本次是统一管理**实现补齐合规**，无需求文本变更

## Impact

- 新增 `frontend/src/components/ClusterCard.vue`
- `frontend/src/views/ClusterList.vue`（1005→806 行）、`frontend/src/views/CentralList.vue`（2499→2223 行）
- 测试：挂载 19 例 + 源码守卫 5 例（+ 后续 #id 尾注守卫 3 例）
- `AGENTS.md` 关键约定 #52（卡片解剖唯一实现，禁止页面重内联/复制样式）
- commits：`88ea4dc8`（组件化统一）、`532f56c5`（删 #id 尾注 + tooltip）
