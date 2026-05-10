## Context

路由列表位于 `ClusterList.vue` 的路由 Tab 中，使用 Ant Design Vue 的 `a-table` 组件。

当前问题：
1. `rowSelection.onChange` 传入 `rows[0]`，导致点击新行时始终选中第一行
2. 操作列（actions）默认不在 `routeColumnsSelected` 中，且列配置弹窗过滤掉了 actions 列

## Goals / Non-Goals

**Goals:**
- 修复单选切换逻辑
- 操作列默认显示
- 操作列和操作按钮都可配置

**Non-Goals:**
- 不实现多选（仅单选）
- 不修改后端 API

## Decisions

### 1. 选择逻辑修复

**问题**：`onChange: (keys, rows) => selectRoute(cluster, rows[0])`

**解决**：改为 `rows[rows.length - 1]`，点击哪行选哪行

### 2. 默认列配置

**现状**：`routeColumnsSelected = ref(['name', 'uri', 'methods', 'upstream_id', 'priority', 'status'])`

**改为**：`routeColumnsSelected = ref(['name', 'uri', 'priority', 'actions'])`

### 3. 操作按钮可配置

**新增数据结构**：
```typescript
const allActionButtons = [
  { key: 'publish', title: '发布' },
  { key: 'version', title: '版本管理' },
  { key: 'copy', title: '复制' },
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' }
]
const routeActionsSelected = ref(['publish', 'version', 'copy', 'edit', 'delete'])
```

**UI**：在列配置弹窗中增加操作按钮配置区块

### 4. 操作列可显示/隐藏

**修改**：移除列配置弹窗中 `filter(c => c.key !== 'actions')` 的过滤逻辑

## Risks / Trade-offs

- 操作按钮较多时，行可能变宽 → 用户可自行配置隐藏部分按钮
- 无后端改动，风险较低