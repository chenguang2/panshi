## Why

TCP 代理（四层代理）的节点地址目前只支持 IPv4，与上游管理同样的限制。Edge API 原生支持 `host:port` 格式中 host 为域名。用户需要为 TCP 代理节点配置域名地址的场景（如指向内部 TCP 负载均衡器）。

## What Changes

- 前端 `StreamProxyFormWizard.vue`：普通模式（非 DNS）节点地址从仅 IPv4 扩展为支持 IPv4 / IPv6 / 域名
- DNS 代理模式的节点暂时保持 IPv4 不变（后续再统一）
- 后端无变更（`TargetSchema.target` 为 `str`，无需限制）

## Capabilities

### New Capabilities
_无_

### Modified Capabilities
- `stream-proxy-management`: TCP 代理普通模式节点地址支持 IPv4 / IPv6 / 域名

## Impact

- `frontend/src/components/StreamProxyFormWizard.vue` — 表头文案、placeholder、校验函数、字段名 `ip` → `host`、IPv6 自动 `[]` 包装
