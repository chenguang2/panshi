## Context

SSL 证书已通过 `cluster_ssl.py` 独立管理，但 Edge 数据导入（`EdgeImportService`）和 Edge 直连页面（`EdgeClient.vue`）尚未接入。

Edge 数据导入已支持 upstreams、routes、plugin_configs、global_rules、plugin_metadata、stream_proxies 六种资源。SSL 证书作为第七种资源加入，流程与 plugin_metadata 类似。

Edge 直连页面已有资源类型下拉选择，新增 `ssl` 即可复用现有 CRUD 逻辑。

## Goals / Non-Goals

**Goals:**
- 数据导入支持 SSL 证书：拉取、格式转换、冲突检测、导入写入 DB
- Edge 直连页面支持 SSL 证书操作（列表/查看/创建/删除）

**Non-Goals:**
- 不改动 SSL 证书独立管理页面（已存在）
- 不改动 EdgeClient 层（`"ssl"` 资源路径已注册）

## Decisions

### 1. 导入数据转换
- **选择**：新增 `convert_ssl_certificate()`，Edge 返回的 `{key, value}` 格式解析为 DB 字段
- **理由**：字段映射与 plugin_metadata 不同，无法复用

### 2. 字段映射

| Edge 字段 | DB 字段 | 转换 |
|---|---|---|
| key 末尾 | edge_uuid | `key.rsplit("/", 1)[-1]` |
| value.snis (Array) | sni (String) | `snis.join(", ")` |
| value.cert | cert | 直接映射 |
| value.key | private_key | 直接映射 |
| value.type | cert_type | 直接映射 |
| value.ssl_protocols (Array) | ssl_protocols (JSON) | `json.dumps()` |
| value.status | status | 直接映射，默认 1 |
| 无对应 | name | 用 edge_uuid |

### 3. 冲突检测
- **选择**：按 `edge_uuid` 检测冲突，与 upstream/route 等其他资源一致
- **理由**：代码可复用现有 `detect_conflicts` 的 edge_uuid 检测模式

### 4. 导入 ConfigVersion
- **选择**：导入 SSL 证书时创建 `ConfigVersion(version=1)`，与 plugin_metadata 一致
- **理由**：保持版本管理的一致性

### 5. Edge 直连
- **选择**：新增 SSL Tab，与现有插件元数据 Tab 结构一致
- **理由**：EdgeClient.vue 使用 Tab 模式组织不同资源，非下拉选择器
