## Context

四层代理 DNS 模式当前发布到 Edge 的格式：
```json
"dns_upstream": {
  "hosts": {
    "test.local": {
      "nodes": {"127.0.0.1:53": []},
      "type": "roundrobin"
    }
  }
}
```

Edge 端要求的增强格式（从文档 `docs/design/健康检查.md`）：
```json
"dns_upstream": {
  "hosts": {
    "test.local": {
      "nodes": {"127.0.0.1:53": []},
      "type": "chash",
      "ttl_valid": 10,
      "checks": {"type": "tcp", "active": {}, "passive": {}}
    }
  }
}
```

## Goals / Non-Goals

**Goals:**
- 前端 DNS 域名配置支持 TTL 输入
- DNS 模式健康检查默认 `{"type": "tcp", "active": {}, "passive": {}}`（四层默认为 tcp）
- 发布时传递 ttl_valid 和 per-domain checks 到 Edge

**Non-Goals:**
- 不改动普通四层代理（非 dns）的发布逻辑
- 不改动数据库 schema

## Decisions

### 1. ttl_valid 作为域名级字段
- **选择**：每个域名独立的 ttl_valid 输入
- **理由**：Edge 端 hosts 的每个条目独立支持 ttl_valid，不同域名可设置不同缓存时间

### 2. 健康检查默认值
- **选择**：dns 模式默认 `{"type": "tcp", "active": {}, "passive": {}}`
- **理由**：文档说明四层代理默认 tcp 检查；用户可在高级配置中修改 checks JSON
