## Context

当前 `ClusterList.vue` 中：
1. 路由表格有列配置功能（`routeColumnsSelected`, `routeColumnPopoverVisible`）
2. 上游表格和节点表格没有列配置功能
3. 搜索框（`a-input-search`）在路由表格中直接显示，尺寸较大

## Goals / Non-Goals

**Goals:**
- 为上游表格和节点表格添加列配置功能
- 将搜索功能纳入列配置，默认开启
- 缩小搜索框尺寸，优化布局

**Non-Goals:**
- 不修改后端 API
- 不改变现有的排序和分页逻辑

## Decisions

### 1. 列配置数据结构

**新增数据结构**：
```typescript
// 上游列配置
const upstreamColumnsSelected = ref(['name', 'load_balance', 'actions'])
const upstreamColumnPopoverVisible = ref(false)

// 节点列配置
const nodeColumnsSelected = ref(['ip', 'service_port', 'management_port', 'status', 'actions'])
const nodeColumnPopoverVisible = ref(false)
```

### 2. 搜索配置

**新增数据结构**：
```typescript
// 路由搜索配置
const routeSearchVisible = ref(true)  // 默认开启

// 上游搜索配置
const upstreamSearchVisible = ref(true)

// 节点搜索配置
const nodeSearchVisible = ref(true)
```

### 3. 列配置界面布局

在每个表格的列配置弹窗中，单独增加一行搜索配置：
```vue
<div style="font-weight: 500; margin-bottom: 8px;">搜索</div>
<a-checkbox v-model:checked="routeSearchVisible">显示搜索框</a-checkbox>
```

### 4. 搜索框尺寸调整

**现状**：宽度 200px
**改为**：宽度 150px 或使用 `compact` 模式

### 5. 搜索框与字段选择器同行

**现状**：
```html
<a-input-search ... style="width: 200px;" />
<a-select ... style="width: 120px;" />
```

**改为**：两个元素使用更紧凑的布局

## Risks / Trade-offs

- 列配置数据存储在组件内，刷新页面会重置 → 后续可考虑持久化到 localStorage
- 无后端改动，风险较低