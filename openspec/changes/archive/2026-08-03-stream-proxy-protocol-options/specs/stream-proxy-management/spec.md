## MODIFIED Requirements

### Requirement: User can list stream proxies
The system SHALL display stream proxies in a card-grid layout with two separate views: 四层代理 and DNS 代理，通过侧边栏菜单和 `route.query.type` 参数区分。共享逻辑通过 `useStreamProxyList` composable 复用。侧边栏菜单名为"四层代理"（不再叫"TCP代理"，因其覆盖 TCP/UDP/TLS 三种协议）。

#### Scenario: List 四层代理 (normal proxies)
- **WHEN** user clicks "四层代理" in sidebar
- **THEN** the system navigates to `/stream-proxies?type=normal`
- **AND** displays only `proxy_type=normal` proxies as cards
- **AND** page title SHALL be "四层代理"
- **AND** page header description SHALL 说明该视图覆盖 TCP/UDP/TLS 三种四层转发协议

#### Scenario: List DNS proxies
- **WHEN** user clicks "DNS代理" in sidebar
- **THEN** the system navigates to `/stream-proxies?type=dns`
- **AND** displays only `proxy_type=dns` proxies as cards
- **AND** page title SHALL be "DNS 代理"

#### Scenario: Switch between 四层代理/DNS views
- **WHEN** user clicks the other proxy type in the sidebar
- **THEN** the system SHALL reload data with the new `proxy_type` filter without full page reload

#### Scenario: Filter by cluster
- **WHEN** user selects a cluster from the filter dropdown
- **THEN** the system shows only stream proxies belonging to that cluster

#### Scenario: Search by name
- **WHEN** user types a search keyword
- **THEN** the system filters stream proxies whose name matches the keyword

### Requirement: Stream proxy supports advanced config
The system SHALL allow configuring timeout, keepalive pool, protocol, and optional match conditions.

#### Scenario: Configure timeout
- **WHEN** user expands advanced config and sets connect/send/read timeout values
- **THEN** the system stores and publishes these timeout values to Edge

#### Scenario: Configure keepalive pool
- **WHEN** user expands advanced config and sets keepalive pool size, idle timeout, max requests
- **THEN** the system stores and publishes these keepalive values to Edge

#### Scenario: Select TCP, UDP or TLS protocol
- **WHEN** user selects the protocol in Step 2 of the wizard via a Radio control with three options: TCP (默认), UDP, TLS
- **THEN** the system stores `scheme='tcp'` (default), `scheme='udp'`, or `scheme='tls'` respectively
- **AND** each Radio option SHALL display a one-line description of the protocol difference (TCP: 面向连接的流式传输；UDP: 无连接的报文传输；TLS: 加密的 TCP 传输)
- **AND** after selection, the system SHALL display a dynamic hint below describing the publish behavior of the selected protocol
- **AND** TLS SHALL NOT require selecting a certificate or any additional fields — only `scheme='tls'` is stored
- **AND** UDP SHALL be identical to TCP except for the `scheme` value
- **AND** publish SHALL send the uppercased protocol (`TCP`/`UDP`/`TLS`) to Edge

#### Scenario: Configure retries
- **WHEN** user expands advanced config and sets retry count and retry timeout
- **THEN** the system stores and publishes these retry values to Edge

#### Scenario: Configure health check
- **WHEN** user expands advanced config and edits the health check JSON
- **THEN** the JSON SHALL be saved to the `checks` field and published to Edge

## ADDED Requirements

### Requirement: 四层代理协议合法性校验（仅约束写入）
后端创建/更新 schema（`StreamProxyCreate`/`StreamProxyUpdate`）SHALL 限制 stream proxy 的 `scheme` 字段取值，只允许 `tcp`、`udp`、`tls` 三个值。`StreamProxyBase` 与响应 schema SHALL 保持宽松（不继承 Literal），确保存量/导入的非三值数据读取不受影响。

#### Scenario: 合法 scheme 值被接受
- **WHEN** 用户通过 API 创建或更新代理，`scheme` 为 `tcp`、`udp` 或 `tls` 之一
- **THEN** 请求 SHALL 被接受并正常保存

#### Scenario: 非法 scheme 值被拒绝
- **WHEN** 用户通过 API 提交 `scheme` 为其他值（如 `grpc`、`tcp_udp`）
- **THEN** 请求 SHALL 被拒绝并返回 422 校验错误

#### Scenario: 存量非三值 scheme 读取正常
- **WHEN** 数据库中已存在 `scheme` 非三值的代理（如历史 `tcp_udp`）
- **THEN** 该代理的列表、详情、发布接口 SHALL 正常返回（不因响应 schema 校验失败而 500）

### Requirement: 导入 scheme 归一化
Edge 数据导入时，导入的 stream proxy `scheme` SHALL 归一化为三值之一，防止绕过 API 校验写入非法值。

#### Scenario: 导入合法 scheme
- **WHEN** Edge 上游返回的 scheme 为 `tcp`、`udp` 或 `tls`
- **THEN** 导入产物 SHALL 保留该值

#### Scenario: 导入非法 scheme 被归一化
- **WHEN** Edge 上游返回的 scheme 为其他值（如 `http`、`grpc`、遗留 `tcp_udp`）
- **THEN** 导入产物 SHALL 将该值归一化为 `tcp`
