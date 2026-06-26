## Why

集群管理页面已有分组筛选（`group_name` 下拉框），但其他资源管理页面（节点管理、上游管理、路由管理、插件组、四层代理、全局规则、静态资源）只有集群筛选，缺少分组前置筛选。用户在使用分组管理集群后，进入这些页面仍需从全部集群的长列表中查找，体验断裂。

## What Changes

- 在 NodeList、UpstreamList、RouteList、PluginConfigList、StreamProxyList、GlobalRuleList、StaticResourceList 七个页面集群筛选下拉框之前，增加分组筛选下拉框
- EdgeEnv.vue 改造 filter bar 布局（由 label 式改为平铺式），增加搜索框和分组筛选
- 分组筛选为纯前端过滤，从已加载的集群列表中提取 `group_name` 构建选项
- 选择分组后，集群下拉框只显示该分组下的集群
- 切换分组时自动重置集群筛选为"全部集群"
- RouteList 切换分组同时触发 upstream 联动
- 默认选中"全部分组"，行为与当前一致
- 集群管理页面自身的分组筛选保持不变

## Capabilities

### New Capabilities
- `group-filter-on-resource-pages`: 资源管理页面增加分组前置筛选，提高分组管理用户的操作效率

### Modified Capabilities
- `node-management`: 节点列表页增加分组筛选
- `upstream-management`: 上游列表页增加分组筛选
- `route-management`: 路由列表页增加分组筛选
- `cluster-plugin-groups`: 插件组列表页增加分组筛选
- `node-row-actions` 等已有 spec 无需求变更，仅 UI 增加筛选控件

## Impact

- **后端**: 无变更。`group_name` 是 Cluster 模型字段，分组过滤完全在客户端进行
- **前端**: 8 个 .vue 文件。其中 7 个文件各加一个分组 select + 对应的 computed 逻辑（约 10-15 行/文件）。EdgeEnv.vue 需同时改造 filter bar 布局为平铺样式并增加搜索框（约 40 行）
- **依赖**: 无新增外部依赖
