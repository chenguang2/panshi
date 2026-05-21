## 1. 修改删除弹窗节点选择 UI

- [ ] 1.1 在 `ClusterList.vue` 的 `showDeleteConfirm` 中，勾选"Edge 节点"后展开节点列表
- [ ] 1.2 在 `PluginMetadata.vue` 的 `deletePlugin` 中，同样勾选后展开节点列表
- [ ] 1.3 节点列表显示所有活跃节点（IP:port），每个带 checkbox，默认全选
- [ ] 1.4 将选中的 node_ids 传给 onOk 回调 / API 调用

## 2. 后端支持 node_ids 过滤

- [ ] 2.1 在 `DeleteClusterRequest` 中添加可选的 `node_ids: list[int]` 字段
- [ ] 2.2 所有删除端点（上游、路由、插件组、全局规则、静态资源、插件元数据）收到 `node_ids` 时只删除指定节点
- [ ] 2.3 `node_ids` 为空时保持原有逻辑（查所有活跃节点）

## 3. 验证

- [ ] 3.1 各资源类型删除弹窗均显示节点列表
- [ ] 3.2 取消勾选的节点不发送删除请求
