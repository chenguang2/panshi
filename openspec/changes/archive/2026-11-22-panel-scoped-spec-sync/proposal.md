# panel-scoped-spec-sync

## Why

2026-11-21 完成的「统一管理面板 Tab = 独立页组件 scoped 单实现」（AGENTS 规则 #93）把 7 个面板专属组件全部删除：

| 已删除组件 | 现由谁承载 |
|---|---|
| `views/clusters/ClusterNodes.vue` | `views/NodeList.vue`（`scopedClusterId`） |
| `views/clusters/ClusterUpstreams.vue` | `views/UpstreamList.vue` |
| `views/clusters/ClusterRoutes.vue` | `views/RouteList.vue` |
| `views/clusters/ClusterGlobalRules.vue` | `views/GlobalRuleList.vue` |
| `views/clusters/ClusterPluginConfigs.vue` | `views/PluginConfigList.vue` |
| `components/PluginMetadata.vue` | `views/PluginMetadataList.vue` |
| `views/clusters/ClusterStaticResources.vue` | `views/StaticResourceList.vue` |

三份主 spec 仍引用这些已不存在的组件/文件路径，属文档与实现漂移（不涉及新的产品行为，纯口径同步）。

## What Changes

- `cluster-management`：把「6 类发布走统一节点选择确认框」各场景的触发位置从 `ClusterList.vue` 改为「对应资源列表（独立页或统一管理面板 Tab 的 scoped 形态）」；插件元数据场景的组件名改为 `PluginMetadataList.vue`。
- `cluster-management`：**移除**已失效的需求「GlobalPluginSelector SHALL be renamed to PluginMetadata」（该组件两代名字都不存在了）。
- `openresty-version-selector`：`InstallOpenrestyDialog` 的复用场景「ClusterNodes 中使用」改为「统一管理面板节点 Tab（scoped `NodeList`）中使用」。
- `deployment-feature-config`：安装按钮特性过滤场景里的 `ClusterNodes.vue` 的「安装」下拉，改为 scoped `NodeList` 的同一套动作菜单。

## Impact

- 仅规格文档：`openspec/specs/{cluster-management,openresty-version-selector,deployment-feature-config}/spec.md`。
- 代码：无（实现已合入并验收）。
