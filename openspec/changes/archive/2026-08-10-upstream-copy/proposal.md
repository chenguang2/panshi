## Why

上游管理目前支持编辑/删除/发布/版本管理，但**没有复制功能**。路由管理已有成熟的复制模式（`copyingRoute` 标志 + `复制_` 前缀 + 表单填充后 POST 新建）。上游作为与路由平级的资源，用户常需基于现有上游快速创建相似配置（相同负载均衡策略、健康检查、超时等高级配置），复制可避免重复手工填写。

## What Changes

- **操作按钮加「复制」**：`allUpstreamActionButtons` 增加 `{ key: 'copy', title: '复制' }`；**`defaultActions` 同步加 copy**（评审确认，与路由一致，避免 localStorage 持久化配置导致复制按钮默认不可见）
- **复制逻辑** `copyUpstreamByRecord(cluster, upstream)`（仿照路由 `copyRouteByRecord`）：
  - 从集群列表加载最新数据（保留 `loadUpstreams`，评审确认）→ 取源上游完整配置
  - `copyingUpstream = true`、`editingUpstream = null`（走 POST 新建分支）
  - 表单填充：`name = 复制_${源name}` + 全部字段（提取公共 `fillUpstreamForm`，含高级配置与 toggle 状态，评审确认全部提取）
  - 打开表单弹窗
- **状态复位（评审确认）**：`showAddUpstreamModal` 与 `editUpstreamByRecord` 均设 `copyingUpstream = false`——避免复制关闭后标题/name 残留
- **表单标题**：`copyingUpstream` 时显示「复制上游」
- **提交逻辑**：`handleUpstreamSubmit` 的 PUT/POST 分支——`copyingUpstream` 时走 POST（新建），不更新原上游（由 `editingUpstream = null` 自动实现）
- **全局上游管理页复制（评审确认）**：`UpstreamList.vue`（用独立 `UpstreamFormModal` 组件）也补齐复制——组件加 `copyingUpstream` prop（填充/提交/标题），UpstreamList 的 `handleAction` 加 copy case 与菜单项

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `upstream-management`: 上游管理支持复制，基于现有上游快速创建相似配置。

## Impact

- `frontend/src/composables/useClusterUpstreams.ts`：`copyingUpstream` 标志、`copyUpstreamByRecord`、公共 `fillUpstreamForm`（编辑/复制复用）、操作按钮 + `defaultActions`、两入口状态复位
- `frontend/src/views/clusters/ClusterUpstreams.vue`：表单标题「复制上游」（行操作按钮基于 allUpstreamActionButtons 自动渲染，无需改）
- `frontend/src/components/UpstreamFormModal.vue`：加 `copyingUpstream` prop（填充/提交/标题）
- `frontend/src/views/UpstreamList.vue`：handleAction 加 copy case + 菜单项
- `frontend/src/composables/__tests__/useClusterUpstreams.test.ts`、`views/__tests__/UpstreamList.test.ts`、`components/__tests__/UpstreamFormModal.test.ts`：复制测试
- 后端无改动（复制是前端新建流程）
