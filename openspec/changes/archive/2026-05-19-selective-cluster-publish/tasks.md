## 1. 后端：Schema + API 改造

- [x] 1.1 在 `backend/app/schemas/cluster.py` 新增 `PublishRequest` model（`node_ids: list[int] | None = None`）
- [x] 1.2 改造 `clusters.py` 中 5 个 publish 端点接受 `PublishRequest`，按 `node_ids` 过滤发布目标
- [x] 1.3 改造 `plugin_metadata.py` 中 `publish_plugin_metadata` 端点接受 `PublishRequest`，按 `node_ids` 过滤发布目标
- [x] 1.4 运行后端测试确保向后兼容（无 body 请求仍发布到所有节点）

## 2. 前端：新建 PublishConfirmModal 组件

- [x] 2.1 新建 `frontend/src/components/PublishConfirmModal.vue`，实现节点列表加载和展示
- [x] 2.2 实现全选/取消全选/禁用离线节点/实时计数/确定按钮禁用逻辑
- [x] 2.3 组件 emit `confirm(nodeIds: number[])` 和 `cancel()` 事件

## 3. 前端：ClusterList.vue 改造 5 处发布

- [x] 3.1 `publishUpstream()` 改用 PublishConfirmModal
- [x] 3.2 `publishRoute()` 改用 PublishConfirmModal
- [x] 3.3 `publishPluginConfig()` 改用 PublishConfirmModal
- [x] 3.4 `publishGlobalRule()` 改用 PublishConfirmModal
- [x] 3.5 `publishStaticResource()` 改用 PublishConfirmModal

## 4. 前端：GlobalPluginSelector → PluginMetadata 重命名

- [x] 4.1 重命名文件 `GlobalPluginSelector.vue` → `PluginMetadata.vue`
- [x] 4.2 更新内部 CSS class `.global-plugin-selector` → `.plugin-metadata`
- [x] 4.3 更新 `ClusterList.vue` 中的 import 和模板标签

## 5. 前端：PluginMetadata.vue 发布改造

- [x] 5.1 `publishPlugin()` 改用 PublishConfirmModal（新增确认环节）

## 6. 验证

- [x] 6.1 LSP diagnostics 无错误（前端3文件全部通过，后端为预存SQLAlchemy类型问题）
- [ ] 6.2 前端 `npm run dev` 正常启动
- [ ] 6.3 后端 `uv run pytest` 通过
- [ ] 6.4 确认 6 个发布入口均弹出节点选择对话框，选节点后发布正常
