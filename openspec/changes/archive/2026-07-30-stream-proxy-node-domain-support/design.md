## Context

`StreamProxyFormWizard.vue` 中的普通 TCP 代理节点地址只支持 IPv4，与上游管理的问题相同。组件使用 `IP_PATTERN` 纯 IPv4 正则校验，域名会被拦截。后端 `TargetSchema.target` 是 `String(255)`，Edge API 的 `nodes` 格式为 `{"host:port": weight}`，host 支持域名。

DNS 代理模式（`proxy_type === 'dns'`）的节点暂时保持 IPv4，不纳入本次范围。

## Goals / Non-Goals

**Goals:**
- `StreamProxyFormWizard.vue` 普通模式节点支持 IPv4 / IPv6（带 `[]` 或不带）/ 域名
- 复用 `validateHost` / `buildTarget` / `parseTarget` 通用逻辑（复用或内联至组件）
- 错误提示具体到是什么问题

**Non-Goals:**
- 不改 DNS 代理模式的节点（`DnsTarget`）
- 不改后端模型、API、数据库
- 不改 Edge 发布格式

## Decisions

- `ip` → `host` 字段重命名（与 `UpstreamTargetForm` 保持一致）
- `targetErrors`（数组）保持结构不变，只改校验内容和文案
- 复用与 `UpstreamFormModal` 相同的 `validateHost` / `buildTarget` 函数逻辑（直接写入组件而非复用 composable，避免跨文件依赖）

## Risks / Trade-offs

- [DNS 代理未覆盖] → 明确在 Non-Goals 中声明，后续需要再统一
