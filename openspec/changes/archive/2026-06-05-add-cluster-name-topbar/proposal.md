## Why

管理页面（全局规则、插件组、静态资源、插件元数据）的卡片网格中缺少集群名称展示，用户在筛选"全部集群"时无法区分卡片属于哪个集群。需要在卡片顶部添加集群名称顶栏，让用户一目了然。

## What Changes

- 全局规则、插件组、静态资源、插件元数据四个页面：每张卡片顶部添加浅蓝色顶栏，显示所属集群名称
- 后端修复：`cluster_name` 在 `display_name` 为空时回退到 `name`
- 涉及的页面：GlobalRuleList、PluginConfigList、StaticResourceList、PluginMetadataList

## Capabilities

### New Capabilities
- 无（仅修改现有页面 UI）

### Modified Capabilities
- 无（不修改 spec 级需求）

## Impact

- 前端修改：`GlobalRuleList.vue`、`PluginConfigList.vue`、`StaticResourceList.vue`（新增 topbar + CSS）
- 后端修改：`global_rules.py`、`plugin_configs.py`、`static_resources.py`（cluster_name 回退逻辑）
- 无新依赖
