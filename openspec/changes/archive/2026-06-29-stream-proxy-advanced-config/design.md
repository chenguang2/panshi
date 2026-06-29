## Context

四层代理（StreamProxy）当前配置项少于七层上游（Upstream），两者在负载均衡、重试、健康检查等能力上应保持一致。

## Goals / Non-Goals

**Goals:**
- 一致性哈希选择后显示 hash key（写死 `remote_addr`）
- 高级配置增加重试次数、重试超时、健康检查
- 移除 remote_addr 和 SNI

**Non-Goals:**
- 不改动发布的 Edge API 契约结构（仅扩展 upstream 字段）
- 不涉及七层上游的 host 策略/pass_host/scheme 等字段

## Decisions

### Decision 1: DB 字段对齐 Upstream

StreamProxy 增加与 Upstream 相同的字段：
- `hash_on` (String, nullable)
- `key` (String, nullable)
- `checks` (Text/JSON, nullable)
- `retries` (Integer, nullable)
- `retry_timeout` (Integer, nullable)

### Decision 2: 哈希 key 写死 remote_addr

选择 chash 时，`hash_on` 固定为 `'vars'`，`key` 固定为 `'remote_addr'`，前端只读显示。

### Decision 3: 健康检查使用 JSON 编辑

同七层上游的 UpstreamFormModal 模式：textarea + JSON 序列化。

### Decision 4: 不删除旧字段

DB 中保留 `remote_addr` 和 `sni` 列（保持向后兼容），仅前端不再提供输入。
