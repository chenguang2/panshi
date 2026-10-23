# stream-proxy-ux-review-fixes 变更规格

## MODIFIED Requirements

### Requirement: System detects available stream ports from edge.env
The system SHALL read the remote edge.env file from a selected cluster node and parse available stream listen ports. 参考节点下拉 SHALL 标注并禁选离线节点；检测失败时 SHALL 给出原因与解法，并自动勾选「手动输入端口」定位输入框。检测日志面板 SHALL 如实标注为「检测步骤」而非伪装实时事件流。

#### Scenario: Detect ports successfully
- **WHEN** user selects a cluster and reference node, clicks "检测可用端口"
- **THEN** the system reads the remote edge.env file via Ansible, parses `deploy.stream.edge.listen` addresses, extracts the port numbers, queries both DB (`ps_stream_proxy`) and Edge node (via `EdgeClient.api("stream_route", "list")`) for occupied ports, and returns a combined port status list

#### Scenario: Parse multiple listen addresses
- **WHEN** edge.env has multiple entries under `deploy.stream.edge.listen` (e.g., `- addr: 0.0.0.0:9970`, `- addr: 0.0.0.0:9971`)
- **THEN** the system extracts all unique port numbers (9970, 9971)

#### Scenario: Handle non-standard listen format
- **WHEN** edge.env listen entry includes SSL or other options (e.g., `- addr: 0.0.0.0:9943 ssl: true`)
- **THEN** the system still correctly extracts port 9943

#### Scenario: Stream module is disabled in edge.env
- **WHEN** edge.env has Stream configured as `NOstream` (disabled)
- **THEN** the system SHALL 提示该节点 Stream 模块未启用并引导改用手动输入（沿用既有处理，不视为错误）

#### Scenario: custom include ports are ignored
- **WHEN** edge.env contains custom include files with additional ports
- **THEN** those ports SHALL NOT appear in the detection results

#### Scenario: edge.env read fails
- **WHEN** the remote node is unreachable or SSH connection fails
- **THEN** the error SHALL 说明原因与解法：「节点 {ip} 当前不可达或 Edge 未安装，无法读取端口配置；可勾选下方『手动输入端口』继续，或到『节点管理』检查节点状态」
- **AND** 系统 SHALL 自动勾选「手动输入端口」并聚焦输入框

#### Scenario: 离线参考节点禁选
- **WHEN** 用户展开参考节点下拉
- **THEN** 离线节点 SHALL 显示「（离线）」后缀且 SHALL NOT 可选中
- **AND** 当前已选节点变为离线时 SHALL 在节点选择下方提示「该节点当前离线，检测可能失败」
