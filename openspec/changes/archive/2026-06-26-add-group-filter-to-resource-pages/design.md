## Context

当前集群管理页面（`ClusterList.vue`）已有分组筛选功能，用户可以为集群设置 `group_name` 并按分组过滤。但进入其他资源管理页面后，只有集群下拉框（列出全部集群），缺少分组前置筛选，用户需要从长列表中手动查找目标集群。

`group_name` 字段仅存在于 `ps_cluster` 表。其他资源（节点、上游、路由、插件组、四层代理、全局规则、静态资源）通过 `cluster_id` 关联集群，没有自己的分组字段。因此分组过滤只能是纯前端的二次筛选。

## Goals / Non-Goals

**Goals:**
- 在 8 个资源管理页面上增加分组筛选（节点管理、上游管理、路由管理、插件组、四层代理、全局规则、静态资源、edge.env），与集群管理页面的分组筛选体验一致
- 分组作为集群下拉框的前置过滤：选择分组 → 集群下拉仅显示该分组下的集群
- 纯前端实现，不需要后端改动
- 默认选中"全部分组"，不改变现有用户的操作流程

**Non-Goals:**
- 不修改分组管理本身（集群的 `group_name` 创建/编辑逻辑不变）
- 不为其他资源模型增加 `group_name` 字段
- 不做后端 API 的 `group` 查询参数支持
- 不修改这些页面的数据加载逻辑，只改筛选 UI

## Decisions

### 1. 筛选层级顺序：搜索 → 分组 → 集群
**选择**：分组 select 放在搜索框和集群 select 之间，选择分组后联动更新集群选项。与插件组（PluginConfigList）的布局一致。
**理由**：符合用户"先搜再筛大类再选小类"的心智模型。分组筛掉不相关的集群后，集群下拉列表大幅缩短。

```
全局布局:  [搜索...]  [全部分组 ▼]  [集群 ▼]  共 N 个
```

EdgeEnv.vue 当前使用 label 式布局（`集群: [select] 参考节点: [select]`），改造为平铺式：

```
改造前:  集群: [集群 ▼]     参考节点: [节点 ▼]
改造后:  [搜索...]  [分组 ▼]  [集群 ▼]  参考节点: [节点 ▼]
```

### 2. 分组选项来源：从已加载的集群列表提取
**选择**：复用页面上已有的 `clusters` 列表，用 `new Set(clusters.map(c => c.group_name || ''))` 提取分组名
**理由**：所有页面都已加载集群列表（用于 clusterFilter），无需额外 API 调用。与 ClusterList.vue 的实现方式一致。

### 3. 分组筛选实现方式：computed property
**选择**：新增一个 `filteredClusters` computed，根据 `groupFilter` 值过滤集群列表
**理由**：纯计算属性，无需维护额外状态，groupFilter 变化时自动更新。

```typescript
const groupFilter = ref('__all__')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map(c => c.group_name || ''))
  return ['__all__', ...Array.from(names).filter(Boolean).sort(), '__ung__']
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter(c => !c.group_name)
  return clusters.value.filter(c => c.group_name === groupFilter.value)
})
```

### 4. 标签显示
**选择**：复用 ClusterList.vue 的标签方案
- `__all__` → "全部分组"
- `__ung__` → "未分组"
- 具体分组名直接显示

### 5. 联动行为
**选择**：切换分组时无条件重置集群筛选为"全部集群"，并触发集群变化的后续联动
**理由**：避免切换分组后集群选择落在不存在的选项上。虽然当前选中的集群有可能仍在新分组内，但判断逻辑增加了复杂度，而分组切换是低频操作，重置集群选择是可接受的 UX 取舍。

**RouteList 特殊处理**：切换分组时除重置 clusterFilter 外，还需调用 `onClusterChange()` 以触发上游筛选重置和路由列表刷新。

## Risks / Trade-offs

- **[视觉噪音]** 不使用分组的用户会看到一个只有"全部分组"+"未分组"的下拉框。**缓解**：选项只有 2-3 个时几乎不占空间，样式紧凑（width:140px），不影响主操作。
- **[加载时序]** 集群列表 API 返回后才会有分组选项，初始加载时分组下拉框只有"全部分组"。**缓解**：与当前行为一致，用户感受不到差异。
- **[改动分散]** 8 个页面需要逐个修改，但模式高度一致，复制粘贴后微调即可，风险低。
