## Context

插件元数据（PluginMetadata）目前只能在集群详情页中通过 `PluginMetadata.vue` 双栏组件管理，不支持跨集群统一查看。需要提供一个独立管理页面，以卡片网格形式展示所有集群的所有插件元数据。

已有基础设施：
- 后端 `/clusters/{cluster_id}/plugin-metadata/*` — 集群级 CRUD + 发布 + 版本 API
- `PluginEditorDrawer` — 插件配置编辑器（表单模式 + JSON 模式）
- `PublishConfirmModal` — 发布节点选择弹窗
- `VersionManagementModal` — 版本历史/回滚弹窗（已支持 `resourceType=plugin_metadata`）
- `showDeleteConfirm` / `executePublish` / `executeDeleteWithProgress` — 共享操作函数

## Goals / Non-Goals

**Goals:**
- 新增跨集群 API `GET /api/v1/plugin-metadata`（搜索+集群筛选+分页）
- 独立管理页面，卡片网格展示所有插件元数据（和 GlobalRuleList 一致）
- 每卡片显示：插件名称、所属集群、版本、已发布/未发布状态
- 按钮：查看（Drawer）、编辑（弹窗+JSON 编辑器）、删除、发布、版本管理
- 集群筛选器（支持"全部集群"）
- 搜索插件名称
- 新建插件元数据：选集群+选插件名+JSON 配置

**Non-Goals:**
- 不修改已有的集群级 PluginMetadata.vue 组件
- 不修改已有的集群级 API
- 不修改侧边栏导航

## Decisions

### 1. 跨集群 API
- **方案**: 新增 `backend/app/api/v1/plugin_metadata.py`，`GET /plugin-metadata`，和 `global_rules.py` 模式完全一致
- **理由**: PluginMetadata 和 GlobalRule 都是 cluster_id + 文本配置，数据模式几乎相同

### 2. 卡片网格布局
- **方案**: 和 GlobalRuleList.vue 一致的 3 列 card grid
- **理由**: 用户已确认"和全局规则一样"

### 3. 新建弹窗
- **方案**: Modal 内选集群 → 选插件名（从 `GET /plugins/builtin` 获取）→ JSON 编辑器填初始配置
- **理由**: 新建时没有 schema 表单（不像 PluginEditorDrawer），直接用 JSON 编辑器处理 config_data

### 4. 编辑弹窗
- **方案**: Modal 内直接用 `JsonEditorVue` 组件编辑 `config_data`
- **理由**: 编辑已有记录时，JSON 配置是唯一可变字段，无需 PluginEditorDrawer 的 schema 表单切换逻辑

### 5. 状态 Badge
- **方案**: 使用设计系统 `.badge.badge-success` / `.badge.badge-neutral`
- **理由**: 和其他独立页一致

## Risks / Trade-offs

- **[低风险] 新建时不支持表单模式** — 只能编辑 JSON。高级用户在 PluginEditorDrawer 中处理 schema 表单的需求可通过集群详情页的 PluginMetadata 双栏组件满足
