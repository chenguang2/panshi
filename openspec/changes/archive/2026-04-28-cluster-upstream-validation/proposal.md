## Why

集群节点和上游配置缺乏前端校验，导致用户可能提交无效数据（如非法 IP 格式、必填字段为空），体验不佳。上游列表中负载均衡列显示英文而非中文，影响可读性。

## What Changes

**节点添加校验：**
- IP：必填 + 合法 IP 地址格式校验
- 服务端口：必填
- 管理端口：必填
- 状态：必填

**上游添加校验：**
- 名称：必填
- 负载均衡：必填
- 节点列表：必填，且每个节点 IP 必须是合法 IP
- 一致性哈希时：哈希位置和 Key 必填

**上游列表展示：**
- 负载均衡列显示中文（加权轮询/一致性哈希）

## Capabilities

### Modified Capabilities
- `cluster-management`: 增强节点和上游的表单校验逻辑
- `cluster-list-ui`: 上游列表负载均衡列显示中文

## Impact

- `frontend/src/views/ClusterList.vue` - 添加节点和上游的表单校验
