# Proposal

## Why

统一管理页集群 Tab 子表在「列配置」里勾选**默认隐藏**的列（路由的「方法」「上游」、节点的「Edge 安装路径」、上游/路由的「状态」「描述」等）后，这些列会出现在表格最右侧、被「操作」列挡住且**左移不动**：用户反复拖拽表头都回不到中间位置。

真机复现（2026-11-15，localhost:12345，统一管理 → 最大化集群 → 路由页签）确认根因在共享持久化层，而非拖拽手势：

1. `useColumnConfig` 的 `defaultColumns` 语义是「默认可见列」（路由页仅 `name/uri/publish_status/priority/actions` 5 列），但 `setColumnOrder` 拿它当「已知列全集」清洗顺序 → 用户第一次拖拽后写入存储的 `order` 只剩这 5 个键，`methods/upstream_id/status/...` 被剔除；
2. `resolveOrderedColumns` 把「顺序里缺失的键」一律追加到列表末尾 → 方法/上游落在「操作」列右侧；
3. 再次拖拽时顺序清洗又丢一次，于是**无论怎么拖都回不来**（症状表现为"拖不动"）。

复现实录（修复前）：拖「方法」左移 → `order=["name","uri","priority","publish_status","actions"]`、表头变为 `名称 URI 优先级 发布状态 操作 方法 上游`。

## What Changes

- `useColumnConfig` 新增可选 `allColumns`（全量列键，默认序）：顺序清洗按**全量列清单**做，不再丢非默认列；未传时退回 `defaultColumns`（既有消费方行为不变）。
- 统一管理页三张 Tab 子表（`useClusterNodes` / `useClusterUpstreams` / `useClusterRoutes`）传入全量列键。
- `resolveOrderedColumns` 缺失键处理改为**槽位回填**：用户定位过的列按存储顺序填回它们原本占用的槽位，从未定位过的列留在自己的设计位（不再追加到末尾）。存储序完整时该函数等价于原样重排，既有三页行为不变。
- 顺带自愈：旧版遗留的残缺顺序无需迁移，渲染时即按设计位落座。

非破坏性变更，无 API / 后端改动；「操作」列仍为右锚点（列只能在它左侧互移），该约束不变。

## Capabilities

### New Capabilities

（无新能力。）

### Modified Capabilities

- `table-column-order`: 收窄「列顺序持久化」需求——顺序清洗以全量列清单为准，未定位列按设计位落座（非追加末尾），并补充启用默认隐藏列后仍可左移的场景。

## Impact

- 前端 composable：`frontend/src/composables/useColumnConfig.ts`（新增 `allColumns`、`resolveOrderedColumns` 改槽位回填）、`useClusterNodes.ts` / `useClusterUpstreams.ts` / `useClusterRoutes.ts`（传全量列键）。
- 测试：`composables/__tests__/useColumnConfig.test.ts`（残缺顺序自愈 / 槽位填充 / `setColumnOrder` 不丢非默认列）、`useClusterRoutes.test.ts`（启用方法/上游后不排到操作列之后）、`useClusterUpstreams.test.ts`（旧「追加末尾」断言随语义修正）。
- 不受影响：拖拽手势实现（`useColumnDragColumns`）、独立列表页（本就传全量列）、后端与 API。
