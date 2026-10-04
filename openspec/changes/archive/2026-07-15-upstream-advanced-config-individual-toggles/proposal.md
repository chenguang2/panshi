## Why

当前上游高级配置使用单一总开关控制所有字段（健康检查、超时、重试、连接池、Host策略、协议），导致两个问题：

1. **开关粒度太粗** — 用户无法单独控制每个配置项。例如只想设置超时但不动健康检查，也必须开启全部。
2. **取消勾选时字段清空语义错误** — `checks` 和 `timeout` 在总开关关闭后仍发送默认值到后端，DB 永不置 NULL，PUT 发布时 Edge 端收到默认配置而非"不启用"。

## What Changes

- **拆总开关为每项独立 toggle** — 健康检查、超时配置、连接池、重试次数、重试超时、Host策略、通信协议各自拥有独立开关
- **重试次数用 radio 三态选择** — 自动（使用可用节点数）/ 指定重试次数 / 禁用重试，替代 toggle
- **重试超时提取为独立 toggle** — 与重试次数解耦，可单独开关
- **Host 策略和通信协议拆为两个 toggle** — 不再捆绑
- **Toggle OFF 语义改为发 null** — 关闭某配置项时，前端发送 `null`，后端写入 `NULL`，PUT 发布时字段被省略，Edge 使用默认值
- **移除"基础配置始终包含健康检查和超时默认值"的旧行为** — 修改现有 spec 中与此冲突的 requirement

### Breaking Changes

- **BREAKING**: Requirement"基础配置始终包含健康检查和超时默认值"将被移除。创建上游时不再默认发送 checks 和 timeout。
- **BREAKING**: 编辑回填逻辑变更——toggle 状态完全由 DB 值是否为 NULL 决定，不再是推断所有字段是否为默认值。

## Capabilities

### Modified Capabilities

- `upstream-advanced-config`: 上游高级配置从单一总开关改为每项独立 toggle/radio 控制，数据流改为 toggle OFF → null → DB NULL → PUT omit → Edge 默认

## Impact

- **前端**: `UpstreamFormModal.vue` — 模板重构、submit 逻辑重写、编辑回填逻辑重写
- **后端**: `cluster_upstreams.py` — 无需改动，`exclude_unset=True` 和 `setattr` 已天然支持 null 写入
- **后端**: `edge_client.py` — 无需改动，`convert_upstream_to_edge_format` 的条件判断已天然支持 None → omit
- **测试**: 前端单元测试需更新以匹配新的 toggle 行为
