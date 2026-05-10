## Context

集群节点和上游配置在 `ClusterList.vue` 中通过模态框进行添加/编辑。当前节点添加仅有基本表单结构，缺少 IP 格式校验。上游添加对一致性哈希的 Key 字段有 rules，但其他必填字段和 IP 校验缺失。上游列表的负载均衡列直接显示英文值。

## Goals / Non-Goals

**Goals:**
- 添加节点：IP 必填 + 合法 IP 格式校验
- 上游名称、负载均衡、节点列表必填
- 一致性哈希时：哈希位置和 Key 必填
- 节点列表中每个节点 IP 校验
- 上游列表负载均衡列显示中文

**Non-Goals:**
- 不修改后端 API
- 不修改其他列表的展示格式

## Decisions

1. **IP 地址校验正则**
   - 使用 `^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$` 校验 IPv4
   - 也支持 IPv6 简化的基本校验

2. **负载均衡中文映射**
   - `weighted_roundrobin` → `加权轮询`
   - `consistent_hash` → `一致性哈希`

3. **使用 Ant Design Form rules 进行校验**
   - 在 a-form-item 的 rules 属性中添加校验规则
   - 节点 IP 和上游节点 IP 共用 IP 校验函数

## Risks / Trade-offs

无显著风险。

## Open Questions

无
