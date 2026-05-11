## Why

上游配置表单目前是扁平结构，缺少高级配置（健康检查、超时、重试、连接池等），且负载均衡算法仅支持 2 种，一致性哈希的哈希位置也缺少 `vars_combinations` 选项。这限制了用户对上游服务的精细控制能力，需要对齐 Edge API 文档中定义的完整上游配置能力。

## What Changes

- **基础配置层**：负载均衡新增 `ewma`（延迟最小）和 `least_conn`（最少连接）两种算法；一致性哈希的"哈希位置"新增 `vars_combinations`（自定义变量）选项
- **高级配置层（新增）**：参照路由创建弹窗的 Tab 模式，上游表单拆分为"基础配置"和"高级配置"两个 Tab。高级配置包含：健康检查（checks）、重试（retries/retry_timeout）、超时（timeout）、host 策略（pass_host/upstream_host）、通信协议（scheme）、连接池（keepalive_pool）
- **健康检查 UI**：健康检查从隐藏的硬编码默认值变为高级配置中可编辑的表单项，默认展开并沿用现有默认值

## Capabilities

### New Capabilities

- `upstream-load-balance-extended`: 扩展负载均衡算法，新增 ewma（延迟最小）和 least_conn（最少连接）
- `upstream-hash-on-extended`: 一致性哈希的哈希位置新增 vars_combinations（自定义变量）选项
- `upstream-advanced-config`: 上游高级配置功能，将健康检查、重试、超时、host 策略、协议、连接池等配置项从隐藏默认值变为可编辑的高级配置 Tab

### Modified Capabilities

- `upstream`: 负载均衡类型要求从 "两种" 扩展到 "四种"，哈希位置有效值新增 `vars_combinations`
- `upstream-health-check-default`: 健康检查从隐藏默认值变为高级配置 Tab 中可编辑的表单项，默认值沿用不变

## Impact

- **前端**: `frontend/src/views/ClusterList.vue` — 上游表单模板、数据模型、提交逻辑
- **后端**: 可能需要更新 `backend/app/schemas/cluster.py` 中 UpstreamCreate/UpstreamUpdate 的校验规则，以兼容新增字段和负载均衡值
- **API**: 无需新增端点，现有 `/api/v1/clusters/{id}/upstreams` 的 POST/PUT 已支持附加字段透传
