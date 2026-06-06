## Context

`/clusters` 路由当前指向占位页 `ClusterList.vue`（仅显示"集群管理页面开发中..."）。需要实现一个全新的集群管理列表页面，与已有的集中管理页面（`CentralList.vue`）完全独立。

设计参考 `docs/ui/Live-Artifact-4/clusters.html`，该设计稿展示了：
- 集群卡片网格布局（`cluster-grid`）
- 卡片含显示名、状态、分组名、描述、统计、节点标签、操作按钮
- 筛选栏含搜索框、分组下拉、集群计数

后端 `ClusterResponse` schema 已有 6 个统计字段，缺少 `plugin_metadata_count`。

## Goals / Non-Goals

**Goals:**
- 在 `/clusters` 路由实现完整的集群管理列表页面
- 卡片网格展示所有集群，含 7 类统计信息（节点、上游、路由、插件组、全局规则、插件元数据、静态资源）
- 卡片去掉同步按钮
- 分组名称展示在卡片标题头，卡片按分组分类排序
- 筛选栏增加分组名称下拉选择条件
- 后端 ClusterResponse 增加 `plugin_metadata_count` 字段

**Non-Goals:**
- 不修改集中管理页面（`CentralList.vue`）的任何代码
- 不改动现有的后端集群 CRUD API 结构
- 不涉及集群内子资源（节点/上游/路由等）的管理——这些由集中管理页面负责
- 不改动已有的 E2E 测试（除非新增测试）

## Decisions

### Decision 1: 新建 ClusterList.vue 替换占位页

- **方案**: 直接替换 `frontend/src/views/ClusterList.vue` 占位页内容，实现完整页面
- **替代方案**: 新建另一个文件名
- **理由**: 路由 `/clusters` 已经指向 `ClusterList.vue`，且该文件当前仅为占位，直接替换最简洁。占位页代码短（607 字节），无任何引用依赖

### Decision 2: 后端扩展 `plugin_metadata_count` 而非新增独立 API

- **方案**: ClusterResponse 增加 `plugin_metadata_count: int = 0`，后端集群列表查询中增加 `PluginMetadata` 的 SELECT COUNT 子查询
- **替代方案**: 用独立的 `/clusters/{id}/stats` 端点
- **理由**: 与现有 6 个统计字段的处理方式一致，前端无需额外请求

### Decision 3: 前端数据加载复用现有 API，不做新端点

- **方案**: 使用 `GET /api/v1/clusters`（管理员）或 `GET /api/v1/clusters/my`（普通用户）获取集群列表，后端已返回嵌入的统计字段
- **理由**: 集中管理页面已经使用相同的 API，后端无需新增端点

### Decision 4: 客户端分组排序

- **方案**: 前端 computed 属性按 `group_name` 分组排序，命名组按字母序在前，空分组（未分类）在后
- **理由**: 与集中管理页面的分组逻辑一致，集群数量通常较少（<100）

### Decision 5: 遵循设计稿 clusters.html 的视觉风格

- **方案**: 实现 `cluster-grid` 多列卡片网格，卡片结构：标题头（显示名+分组名+状态）→ 描述 → 统计行（7 项）→ 节点标签 → 操作按钮（详情/编辑/测试/删除）
- **理由**: 设计稿提供了完整的视觉参考，确保 UI 一致性

## Risks / Trade-offs

- **[后端兼容性]** 新增 `plugin_metadata_count` 字段需要确保集中管理页面也能正常显示 → 字段默认值 0，前端 `?? 0` 兜底
- **[前端重复]** 两套集群页面（集中管理 + 集群管理）共享同一套后端 API，但前端 UI 不同 → 是设计意图，两者定位不同
- **[样式隔离]** 新页面 CSS 需要与 CentralList.vue 的样式隔离，避免污染 → 使用 scoped style
