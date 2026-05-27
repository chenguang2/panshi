## Context

集群管理页面 (`ClusterList.vue`) 目前采用"网格卡片 + 展开区域"双区域布局。展开后的集群在 `.card-expanded` 中通过 tab 切换展示子内容（节点、上游、路由等）。当同时展开多个集群，或展开时上方仍有网格卡片时，每个集群的可用宽度受限，表格列被压缩。

## Goals / Non-Goals

**Goals:**
- 展开集群标题栏增加"最大化"按钮
- 点击最大化后，所有网格卡片和其他展开集群缩小到顶部紧凑栏，当前集群占满内容区
- 最大化状态下提供顶部切换栏和"退出最大化"按钮
- 纯前端 UI 变更，不涉及后端

**Non-Goals:**
- 不改变现有展开/收回交互逻辑
- 不改变子组件（ClusterNodes、ClusterUpstreams 等）的内部逻辑
- 不新增路由或页面

## Decisions

### Decision 1: 状态驱动渲染，不新增组件

用一个 `maximizedClusterId` ref 控制页面布局模式：
- `null` → 正常模式（网格 + 展开区）
- `number` → 最大化模式

最大化模式下：
- `.cluster-grid` 区域隐藏，替换为 `.cluster-mini-bar`（紧凑切换栏）
- `.expanded-area` 只渲染 `maximizedClusterId` 对应的集群
- 其他集群在 `.cluster-mini-bar` 中显示为紧凑条目，点击可切换最大化目标

**替代方案**：用独立 Drawer/Modal 展示最大化内容。缺点是需要传递 props 到子组件，且与现有展开模式不一致。最终选择原地展开模式。

### Decision 2: 最大化时自动收起其他展开集群

`maximizeCluster()` 函数会清空 `expandedIds` 只保留当前集群，确保最大化状态下只有一个展开项。这与用户需求"其他展开集群缩回到卡片形式"一致。

### Decision 3: 紧凑顶栏复用现有 filteredClusters 数据

紧凑栏直接从 `filteredClusters` 中渲染，每个条目显示状态点 + 名称。当前最大化的集群高亮显示。

## Risks / Trade-offs

- 最大化模式下拖拽排序功能不可用（紧凑栏不支持拖拽）→ 可接受，最大化是临时专注模式
- 多个浏览器 tab 之间状态不共享 → 不影响，纯本地状态
