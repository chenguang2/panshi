## Context

集群管理中有 6 处发布操作（上游/路由/插件组/全局规则/静态资源/插件元数据），当前均无条件发布到集群内所有在线 Edge 节点。前端确认弹窗为简单文字提示，无节点选择能力。

后端 6 个 publish 端点的核心模式完全一致：
```python
nodes_result = await db.execute(
    select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
active_nodes = nodes_result.scalars().all()
for node in active_nodes:
    # 发布到每个节点
```

其中插件元数据的发布位于独立的 `GlobalPluginSelector.vue` 组件和 `plugin_metadata.py` 路由器中，且该组件功能实际为完整的元数据管理面板，命名有歧义。

## Goals / Non-Goals

**Goals:**
- 6 个发布入口统一支持节点选择发布
- 发布确认弹窗默认全不选，需用户主动勾选节点
- 后端 `node_ids` 参数可选，不传时向后兼容（发布到所有在线节点）
- 重命名 `GlobalPluginSelector` → `PluginMetadata`

**Non-Goals:**
- 不改变发布进度弹窗的 UI 和交互逻辑
- 不改变后端 Edge 节点的发布协议和执行逻辑
- 不改动现有的 ConfigVersion 版本管理机制
- 不在本次 change 中进行其他组件重命名

## Decisions

### Decision 1: 通用 `PublishConfirmModal` 组件 vs 内嵌到各处

**方案：新建通用组件 `PublishConfirmModal.vue`**

理由：
- 6 个发布入口的选择节点交互完全一致，抽取为组件避免重复
- 组件只需 `clusterId` 即可自行加载节点列表，不依赖父组件上下文
- 发出 `confirm(selectedNodeIds: number[])` 事件，父组件获取选择结果后调用对应 API

```
PublishConfirmModal
  Props:
    - visible: boolean
    - title: string          # 弹窗标题，如"发布上游: xxx"
    - clusterId: number
  Events:
    - confirm(nodeIds: number[])
    - cancel()
  Slots:
    - default (可选，用于在节点列表下方插入额外提示)
```

### Decision 2: 离线节点处理

- 在线节点（`status == 1`）：正常显示，可选
- 离线节点（`status != 1`）：行灰显，勾选框禁用，标签显示"离线"
- 全选按钮：只勾选在线节点

### Decision 3: 后端请求体设计

新增 `PublishRequest` schema：

```python
class PublishRequest(BaseModel):
    node_ids: list[int] | None = None
```

各 publish 端点改为：

```python
# 改造前
@router.post("/{cluster_id}/upstreams/{upstream_id}/publish")
async def publish_upstream(cluster_id: int, upstream_id: int, db: ...):

# 改造后
@router.post("/{cluster_id}/upstreams/{upstream_id}/publish")
async def publish_upstream(cluster_id: int, upstream_id: int,
    req: PublishRequest | None = None, db: ...):
```

`node_ids` 为空/None 时向后兼容，发布到所有在线节点。

### Decision 4: 插件元数据组件重命名

| 旧 | 新 |
|---|---|
| `GlobalPluginSelector.vue` | `PluginMetadata.vue` |
| `.global-plugin-selector` (CSS) | `.plugin-metadata` |
| `<GlobalPluginSelector>` | `<PluginMetadata>` |

该组件本身功能（可用插件列表、添加/查看/编辑/删除/发布/版本管理）不变。

### Decision 5: 6 个发布入口的改动模式

每个入口的改动模式相同：

```
改造前：
  点击"发布" → Modal.confirm(纯文字) → 点确定 → Modal.info(进度条) → API(无node_ids)

改造后：
  点击"发布" → PublishConfirmModal(节点列表) → 勾选 → 点确定 → Modal.info(进度条) → API(带node_ids)
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| 发布时网络抖动导致部分节点成功部分失败 | 现有逻辑已返回 `results` 数组 + `status: partial`，前端正确渲染 |
| 用户忘记选节点直接点确定 | 按钮在未选时禁用 + 文案提示"请至少选择 1 个节点" |
| `PublishRequest` 中 `node_ids` 包含不属于该集群的节点 | 后端校验 `Node.id.in_(node_ids)` + `Node.cluster_id == cluster_id` |
| 前端 `PublishConfirmModal` 需要的节点数据需额外 API 调用 | 复用集群详情已有的节点列表 API（检查 `/clusters/{id}` 返回是否包含节点信息，若不包含则新增轻量接口） |
| 组件重命名导致 git 历史追溯困难 | 单独一次 commit 只做重命名，不混入其他改动 |
