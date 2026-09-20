## MODIFIED Requirements

### Requirement: 后端代理接口

系统 SHALL 提供 5 个 Stream Route 的代理接口，通过 EdgeClient 调用 Edge 节点 API。

由于 Edge 的创建接口不校验载荷（实测对空载荷 `{}` 亦返回 200 并在节点上创建出既无 `server_port` 也无 `upstream` 的路由），平台 SHALL 在转发前校验写载荷，非法载荷 SHALL 被直接拒绝且不得触达 Edge 节点。

#### Scenario: 列表接口

- **WHEN** `GET /edge-client/nodes/{ip}/{port}/stream-routes` 被调用
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "list")` 并返回 `{"stream_routes": [...]}`

#### Scenario: 创建接口

- **WHEN** `POST /edge-client/nodes/{ip}/{port}/stream-routes` 被调用且载荷合法
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "create", <载荷>)`（即 `POST /stream/edge/admin/routes`），由 Edge 节点分配该路由的 id

#### Scenario: 创建载荷非法被平台拦截

- **WHEN** 创建请求缺少 `server_port`、`server_port` 超出 1–65535，或 `upstream.nodes` 为空
- **THEN** 系统 SHALL 返回 4xx 校验错误
- **AND** SHALL NOT 向 Edge 节点发起任何请求（节点上不得因此新增路由）

#### Scenario: 更新接口

- **WHEN** `PUT /edge-client/nodes/{ip}/{port}/stream-routes/{route_id}` 被调用
- **THEN** 系统 SHALL 调用 `client.api("stream_route", "update", route_id, <载荷>)`，路径 id 与请求中的 id 一致
