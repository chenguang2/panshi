## Why

四层代理的 DNS 模式使用 `dns_upstream` 插件解析域名，目前每个域名只支持配置 `{ nodes, type }`。根据 Edge 端的最新实现，每个域名还需要支持 `ttl_valid`（缓存 TTL）和自定义健康检查配置（`checks: { type, active, passive }`）。需要前后端同步更新。

## What Changes

- **前端**: 每个域名行增加 TTL 输入框（默认 10s）；dns 模式健康检查默认值改为 `{"type": "tcp", "active": {}, "passive": {}}`
- **后端发布**: publish 时将 `ttl_valid` 和 `checks` 传递到 Edge 格式的 dns_upstream hosts 中
- **后端导入**: EdgeImportService 的 `convert_stream_proxy` 支持 `ttl_valid` 和 checks 字段

## Capabilities

### New Capabilities

无新增能力

### Modified Capabilities

- `stream-proxy-management`: 四层代理 DNS 模式的域名配置增加 ttl_valid、checks 支持

## Impact

| 文件 | 改动 |
|---|---|
| `frontend/.../StreamProxyFormWizard.vue` | 域名行加 TTL 输入框、修改 dns 模式健康检查默认值、dns_config 输出加 ttl_valid |
| `backend/.../cluster_stream_proxies.py` | 发布时传递 ttl_valid、checks 到 Edge |
| `backend/.../edge_import_service.py` | 导入时保留 ttl_valid、checks 字段 |
