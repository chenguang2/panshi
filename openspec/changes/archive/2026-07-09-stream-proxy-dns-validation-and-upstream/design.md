## Context

四层代理 DNS 模式中每个域名的目标节点使用组合 `ip_port` 字段（如 `"10.0.0.1:53"`），用户需要手动输入 `:` 分隔。普通模式则已使用独立的 IP 和端口输入框。

## Goals / Non-Goals

**Goals:**
- DNS 目标节点使用独立 IP 和端口输入框，与普通模式一致
- 增加 IP 格式校验和端口范围校验
- DNS 模式展示上游配置占位符

**Non-Goals:**
- 不改动后端 publish 逻辑和 Edge 发送格式
- 不改动普通模式的逻辑

## Decisions

### 1. 字段拆分方式
- **选择**：`ip_port: string` → `ip: string; port: number`
- **理由**：与普通模式 `targets` 的 `{ ip, port }` 结构一致，校验逻辑可复用 `IP_PATTERN`

### 2. 上游配置占位
- **选择**：只读展示 `{"type": "roundrobin", "scheme": "tcp"}`
- **理由**：DNS 模式的上游由 Edge 的 dns_upstream 插件管理，不需要用户配置；占位符让界面结构更清晰
