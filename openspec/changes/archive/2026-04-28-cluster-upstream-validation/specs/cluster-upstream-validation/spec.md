## MODIFIED Requirements

### Requirement: 集群节点添加校验
系统 SHALL 在用户添加节点时进行以下校验：IP 必填且必须是合法 IP 地址格式，服务端口必填，管理端口必填，状态必填。

#### Scenario: 合法 IP 提交
- **WHEN** 用户输入合法 IP 如 `192.168.1.100` 并填写其他必填字段
- **THEN** 系统允许提交

#### Scenario: 非法 IP 拒绝
- **WHEN** 用户输入非法 IP 如 `256.1.1.1` 或 `abc.def` 并提交
- **THEN** 系统显示 IP 地址格式错误提示

#### Scenario: 必填字段为空拒绝
- **WHEN** 用户未填写 IP、服务端口、管理端口或状态任一字段
- **THEN** 系统显示必填字段提示

### Requirement: 上游添加校验
系统 SHALL 在用户添加上游时进行以下校验：名称必填，负载均衡必填，节点列表必填且每个节点 IP 必须是合法 IP。当负载均衡选择一致性哈希时，哈希位置和 Key 也必填。

#### Scenario: 正常提交
- **WHEN** 用户填写名称、选择负载均衡、添加至少一个节点（IP 合法）并提交
- **THEN** 系统允许提交

#### Scenario: 名称为空拒绝
- **WHEN** 用户未填写名称
- **THEN** 系统显示名称不能为空

#### Scenario: 节点 IP 非法拒绝
- **WHEN** 用户添加节点但 IP 格式非法
- **THEN** 系统显示 IP 地址格式错误

#### Scenario: 一致性哈希缺少 Key 拒绝
- **WHEN** 用户选择一致性哈希但未填写哈希 Key
- **THEN** 系统显示 Key 不能为空

### Requirement: 上游列表负载均衡显示中文
系统 SHALL 在上游列表中以中文显示负载均衡类型。

#### Scenario: 加权轮询显示
- **WHEN** 上游的负载均衡为 `weighted_roundrobin`
- **THEN** 列表显示"加权轮询"

#### Scenario: 一致性哈希显示
- **WHEN** 上游的负载均衡为 `consistent_hash`
- **THEN** 列表显示"一致性哈希"
