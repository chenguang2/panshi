## Context

当前平台支持 log_process 插件的 HTTP 模式元数据管理（`/edge/admin/plugin_metadata/log_process`），但 Edge 网关对 Stream 模式使用完全独立的 API 端点（`/stream/edge/admin/plugin_metadata/log_process`）。两个端点维护独立的配置存储，HTTP 路由和 Stream 路由各自读取对应端点的配置。

平台层面，`PluginMetadata` 模型的唯一约束是 `(cluster_id, plugin_name)`，每个集群只能有一个同名插件元数据记录。因此无法在同一条记录上同时管理 HTTP 和 Stream 两套独立的配置并发布到不同端点。

已有 `edge_client.py` 的 `RESOURCE_PATHS` 包含 `plugin_metadata` 但缺少 `stream_plugin_metadata` 和 `stream_plugin` 路径。

## Goals / Non-Goals

**Goals:**
- 用户可以为 log_process 分别配置 HTTP 版和 Stream 版的插件元数据
- 各自发布到正确的 Edge API 端点
- Stream 版插件元数据只能被 Stream 路由使用
- 复用现有的插件元数据管理 UI 和流程

**Non-Goals:**
- 不修改 `PluginMetadata` 模型或数据库约束
- 不改造前端组件（新插件自动出现）
- 不涉及其他插件的 Stream 模式改造（仅 log_process）

## Decisions

### Decision 1: 注册 `log_process_stream` 作为独立插件

在 `plugin_definitions.py` 中新增一个 `log_process_stream` 插件定义，完整复制 `log_process` 的 `schema` 和 `metadata_schema`，仅修改：
- `name`: `"log_process_stream"`
- `display_name`: `"日志记录(Stream)"`
- `description`/`hints`: 标注 Stream 模式

**理由**：
- 利用现有 `(cluster_id, plugin_name)` 唯一约束，两个插件名自然对应两条记录
- 复用全部现有 CRUD 和发布流程，改动最小
- `_stream` 后缀作为命名约定，后续其他 Stream 插件可沿用

### Decision 2: Edge 端点根据 `_stream` 后缀自动选择

修改 `cluster_plugin_metadata.py` 的 `publish_plugin_metadata`：

```python
is_stream = plugin_name.endswith("_stream")
resource = "stream_plugin_metadata" if is_stream else "plugin_metadata"
reload_resource = "stream_plugin" if is_stream else "plugin"
```

Edge 路径映射：
| resource | HTTP 路径 |
|---|---|
| `plugin_metadata` | `/edge/admin/plugin_metadata` |
| `stream_plugin_metadata` | `/stream/edge/admin/plugin_metadata` |
| `plugin` | `/edge/admin/plugins` |
| `stream_plugin` | `/stream/edge/admin/plugins` |

**理由**：`_stream` 后缀规约清晰，可扩展。不需要在 DB 里加 mode 字段，也不需要在 API 参数里传额外的标志。

**关键修正**：推送到 Edge 时，URL 中的 `plugin_name` 需要去掉 `_stream` 后缀，因为 Edge 侧 HTTP 和 Stream 使用相同的插件名 `log_process`，仅通过 base path 区分：

```python
edge_plugin_name = plugin_name.removesuffix("_stream")  # log_process_stream → log_process
resource = "stream_plugin_metadata" if is_stream else "plugin_metadata"
client.api(resource, "update", edge_plugin_name, edge_data)
# URL: /stream/edge/admin/plugin_metadata/log_process
```

### Decision 3: EdgeClient 现有方法加 `stream` 参数

`create_plugin_metadata`、`delete_plugin_metadata`、`get_plugin_metadata`、`update_plugin_metadata` 四个方法统一加 `stream=False` 参数，内部根据该参数选择 resource：

```python
# edge_client.py
def create_plugin_metadata(self, plugin_name, data, *, stream=False):
    resource = "stream_plugin_metadata" if stream else "plugin_metadata"
    return self.api(resource, "update", plugin_name, data)

def delete_plugin_metadata(self, plugin_name, *, stream=False):
    resource = "stream_plugin_metadata" if stream else "plugin_metadata"
    return self.api(resource, "delete", plugin_name)
```

调用方（`cluster_plugin_metadata.py`）：

```python
is_stream = plugin_name.endswith("_stream")
edge_name = plugin_name.removesuffix("_stream")  # log_process_stream → log_process
client.create_plugin_metadata(edge_name, edge_data, stream=is_stream)
client.reload_plugins()  # or reload_stream_plugins()
```

`reload_plugins()` 和 `list_plugin_metadata()` 不走 `api()` 通用方法，单独新增 Stream 版本：

```python
def reload_stream_plugins(self):
    return self._request("PUT", "/stream/edge/admin/plugins/reload", {})

def list_stream_plugin_metadata(self):
    return self._request("GET", "/stream/edge/admin/plugin_metadata")
```

**理由**：保持封装完整性，后续如果在 EdgeClient 上加通用逻辑（加密、重试）不会漏掉 stream 调用。改动量很小——每个方法加一行 resource 选择。

### Decision 4: 导入时读取 Stream 元数据并映射

当前导入流程只调用 `list_plugin_metadata()`（HTTP 端点），Stream 端点的元数据完全不读。需要增加：

```python
# edge_import_service.py fetch_edge_data 中
try:
    raw_stream_pm = client._request("GET", "/stream/edge/admin/plugin_metadata")
    stream_plugin_metadata = _parse_resource_list(raw_stream_pm)
except Exception:
    stream_plugin_metadata = []
```

`convert_plugin_metadata` 检测 key 路径含 `/stream/` 前缀时，`plugin_name` 追加 `_stream` 后缀：

```python
key = edge_pm.get("key", "")
plugin_name = key.rsplit("/", 1)[-1]
if "/stream/" in key:
    plugin_name += "_stream"
```

合并入 `plugin_metadata` 列表，与 HTTP 导入的元数据一并处理冲突检测和保存。

**理由**：Edge 上 HTTP 和 Stream 元数据的 key 都是 `log_process`，不映射则两条记录冲突。

### Decision 5: Config diff 同时读取 HTTP 和 Stream 元数据

当前 config diff 只拉取 HTTP 端点的插件元数据：

```python
# cluster_nodes.py
edge_plugin_metadatas = {pname: pd for p in client.list_plugin_metadata()}
```

需要额外拉取 Stream 端点，并以 `_stream` 后缀为 key 合入同一字典：

```python
edge_plugin_metadatas = {}
for p in client.list_plugin_metadata():
    pname = pd.get("name") or ...
    edge_plugin_metadatas[pname] = pd  # log_process → HTTP config

try:
    for p in client._request("GET", "/stream/edge/admin/plugin_metadata"):
        pd = _edge_val(p)
        pname = (pd.get("name") or ...) + "_stream"
        edge_plugin_metadatas[pname] = pd  # log_process_stream → Stream config
except Exception:
    pass
```

这样 DB 中的 `log_process_stream` 记录能在 edge 数据中找到对应，正常对比。HTTP 版的 `log_process` 对比不受影响。

### Decision 6: 集群删除时 Stream 插件走 Stream 端点

`clusters.py` 中删除集群时，会遍历所有 `PluginMetadata` 逐一调用 `client.delete_plugin_metadata(pm.plugin_name)`。对于 `_stream` 后缀的插件，需要传 `stream=True`：

```python
for pm in plugin_metadatas:
    is_stream = pm.plugin_name.endswith("_stream")
    client.delete_plugin_metadata(pm.plugin_name, stream=is_stream)
```

**理由**：否则 `log_process_stream` 会向 HTTP 端点发删除请求，Edge 上的 Stream 元数据不会被删除。

### Decision 7: 发布日志路径同步适配

`cluster_plugin_metadata.py` 发布流程中的日志路径（用于 EdgeLogger）也需要根据 `_stream` 后缀区分：

```python
is_stream = plugin_name.endswith("_stream")
edge_name = plugin_name.removesuffix("_stream")
base = "/stream/edge/admin" if is_stream else "/edge/admin"

# publish_fn
client.create_plugin_metadata(edge_name, edge_data, stream=is_stream)

# log 路径
path=f"{base}/plugin_metadata/{edge_name}"

# reload
post_publish_fn = client.reload_stream_plugins if is_stream else client.reload_plugins
```

`list_stream_plugin_metadata()` 返回格式需要与 `list_plugin_metadata()` 一致，使用 `_parse_resource_list` 包装：

```python
def list_stream_plugin_metadata(self):
    raw = self._request("GET", "/stream/edge/admin/plugin_metadata")
    return self._parse_resource_list(raw) if isinstance(raw, list) else []
```

### Decision 8: `features.yaml` 白名单加入 `log_process_stream`

**理由**：现有 `features.py` 通过白名单过滤 `BUILTIN_PLUGINS`，不加白名单则前端和后端 API 都不会显示该插件。

### Decision 9: 前端零改动

`PluginMetadataList.vue` 和 `PluginMetadata.vue` 中可配置插件列表由 `BUILTIN_PLUGINS` 中 `enable_metadata: True` 的插件动态生成。`log_process_stream` 加入后自动出现，用户可像操作其他插件一样操作它。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Edge 网关的 Stream 插件重载端点可能与 HTTP 不同 | 已规划 `stream_plugin` 资源路径，`/stream/edge/admin/plugins/reload` |
| 用户可能混淆 `log_process` 和 `log_process_stream` 的用途 | display_name 区分：`"日志记录"` vs `"日志记录(Stream)"`，description 和 hints 注明适用场景 |
| 其他 Stream 插件（如 `monitor`、`traceid`）未来也可能需要拆分 | `_stream` 命名约定可复用，`design.md` 已记录此模式 |
