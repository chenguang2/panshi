## Context

节点配置对比（`GET /clusters/{cluster_id}/nodes/{node_id}/diff`）负责比对 DB 与 Edge 节点上的配置差异。目前支持上游、路由、插件组、全局规则、插件元数据、四层代理的对比。SSL 证书尚未纳入。

插件元数据的 Edge 服务端会自动在配置中注入 `id` 字段（例如 `{"id": "log_process", "logs": "..."}`），DB 中不存该字段，导致对比时始终显示差异。

## Goals / Non-Goals

**Goals:**
- 插件元数据对比时忽略 Edge 侧自动添加的 `id` 字段（通过规则文件配置）
- 新增 SSL 证书的 DB ↔ Edge 配置对比

**Non-Goals:**
- 不改动四层代理对比逻辑（已实现且正常）
- 不改动其他资源的对比逻辑

## Decisions

### 1. 插件元数据 `id` 字段处理

**选择**：在 `equivalence_rules.yaml` 中新增 `plugin_metadata` 规则，通过 `ignore_edge_fields` 配置忽略 `id`。`_compare_plugin_metadata` 对比前遍历 `ignore_edge_fields` 并从 `edge_config` 中 pop。

```yaml
plugin_metadata:
  ignore_edge_fields:
    - id
```

代码层面：
```python
for field in _rules._res_type("plugin_metadata").get("ignore_edge_fields", []):
    edge_config.pop(field, None)
```

**理由**：与 upstream/route 已有的 `ignore_edge_fields` 模式一致。日后 Edge 再新增其他自动注入字段，改 YAML 即可，不用改代码。

**不采用**：硬编码 `edge_config.pop("id", None)` — 不够灵活，与现有风格不一致。

### 2. SSL 证书对比策略

#### 2.1 EdgeClient 新增 `list_ssl()` 方法

与现有资源（`list_upstreams`、`list_routes` 等）保持一致，在 `EdgeClient` 中新增：

```python
def list_ssl(self) -> list[dict[str, Any]]:
    return self.api("ssl", "list")
```

#### 2.2 对比字段及处理

| DB 字段 | Edge 字段 | 特殊处理 |
|---|---|---|
| `name` | `name` | 直接对比 |
| `sni` | `sni` 或 `snis` | Edge 可能是 `sni`(string) 或 `snis`(array)，统一归一化为逗号分隔字符串后对比 |
| `cert_type` | `type` | 直接对比 |
| `cert` | `cert` | 直接对比（Edge 返回解密后的明文） |
| `private_key` | `key` | 直接对比（Edge 返回解密后的明文） |
| `status` | `status` | 直接对比 |

**SNI 归一化逻辑**：
```python
def _normalize_edge_sni(edge_data: dict) -> str:
    if "snis" in edge_data:
        snis = edge_data["snis"]
        return ", ".join(snis) if isinstance(snis, list) else str(snis)
    return edge_data.get("sni", "")
```

#### 2.3 Edge 数据拉取

放在单独的 try/except 中，SSL 获取失败不影响其他资源对比（与四层代理模式一致）：

```python
try:
    edge_ssl_certificates = {}
    for cert in client.list_ssl():
        cd = _edge_val(cert)
        cid = cd.get("id", "")
        if cid:
            edge_ssl_certificates[cid] = cd
except Exception:
    edge_ssl_certificates = {}
```

#### 2.4 对比函数

参考 `_compare_stream_proxy` 模式，新增 `_compare_ssl_certificate`，按 edge_uuid 匹配，逐字段对比。

### 3. cert/private_key 对比可行性

Edge API 的 SM4 加密仅在 HTTP 传输层，应用层收到的已是解密后的明文 JSON。因此 `cert` 和 `key` 字段在 DB 与 Edge 之间是可比对的，不会因为加密导致误报。design 移除此条风险。

## Risks / Trade-offs

- **SNI 格式差异**：Edge 可能返回 `sni`(string) 或 `snis`(array)，归一化逻辑已覆盖。若仍有误报可补充规则。
- **Edge 版本兼容**：旧版 Edge 可能没有 `/edge/admin/ssl` 端点，try/except 兜底不影响其他对比。
- **DB edge_uuid 为空**：SSL 记录 edge_uuid 为空时跳过对比（与四层代理行为一致）。
