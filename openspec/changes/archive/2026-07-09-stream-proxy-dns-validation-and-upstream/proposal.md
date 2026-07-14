## Why

四层代理 DNS 模式的域名目标节点使用组合的 `ip:port` 字段，没有单独的 IP 和端口校验，容易输入错误。同时 DNS 模式缺少上游配置的占位展示，与普通模式体验不一致。

## What Changes

- DNS 目标节点拆分为独立的 IP 和端口输入框，增加 IP 格式和端口范围校验
- DNS 模式增加上游配置占位符（只读，固定 `{"type": "roundrobin", "scheme": "tcp"}`）

## Capabilities

### New Capabilities

无新增能力

### Modified Capabilities

- `stream-proxy-management`: DNS 模式域名目标节点字段拆分与校验；上游配置占位展示

## Impact

| 文件 | 改动 |
|---|---|
| `frontend/.../StreamProxyFormWizard.vue` | DnsTarget 接口拆分 ip/port、模板、校验、提交、编辑回填全链路更新；上游占位符 |
