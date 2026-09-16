## Why

Edge 直连页的「四层代理」Tab 目前只能**查看列表 / 看 JSON / 删除**，没有任何新增或修改入口。运维遇到"这个节点上要补一条 L4 转发"或"把监听端口改掉"时，只有两条路：把节点上的独立配置纳入平台集群走同步发布流程（语义不符——直连页的既有删除明确标注"此操作绕过同步流程"），或手工 curl Edge Admin API。两者都比一个表单重得多。

同时，实测（测试节点 192.168.0.13:16620）发现 Edge 的创建接口**不做任何载荷校验**：对 `POST /stream/edge/admin/routes` 发空载荷 `{}` 会返回 HTTP 200 并在节点上生成一条既无 `server_port` 也无 `upstream` 的垃圾路由（已删除复原）。平台侧不校验就等于把"往节点塞无效路由"的能力开放给任何调用方，因此本变更必须连带补上写入校验。

## What Changes

- 「四层代理」Tab 新增**添加入口**：工具条「添加四层代理」+ 表单弹窗
- 新增行内**编辑入口**：表单回填 → `PUT …/stream-routes/{id}`（id 不变）
- **后端补写入校验**（**依据实测**，非推测）：`server_port` 必填且 1–65535、`upstream.nodes` 至少一个节点、`upstream` 结构合法；非法载荷返回 4xx 且**不向 Edge 发起写入**。这是本变更唯一的后端逻辑改动
- **编辑采用"完整对象为基底 + 深合并 `upstream`"**：Edge 的 PUT 是全量替换，而线上既有路由实测带 `upstream.checks`、`upstream.pass_host`、`plugins.dns_upstream` 等表单不覆盖的字段，浅替换会静默丢失
- 表单字段：监听端口、名称、协议（TCP/UDP）、SNI、remote_addr、上游（类型 / 协议 / 节点+权重 / chash 的 hash_on+key）
- 前端校验：必填与端口范围、至少一个上游节点、监听端口与列表内其它路由冲突时前置拦截
- **审计映射补正**：为 stream-route 的 create/update/delete 三个写端点补显式 `ROUTE_MAP`（当前词汇推断把它们记成 `edge_node_*`，语义错误），前端审计标签同步补 `edge_stream_route`

保持不变的传输范式：创建仍为 `POST …/stream-routes`（集合创建，Edge 自行分配 id，与同页上游/路由 Tab 的"创建 POST / 更新 PUT"一致），更新为 `PUT …/stream-routes/{id}`。二者现有后端实现可用，本变更不改变其语义。

## Capabilities

### New Capabilities
- `edge-stream-route-edit`: Edge 直连「四层代理」Tab 的添加与编辑能力——表单字段与校验、PUT 全量替换下的字段保全、成功/失败反馈

### Modified Capabilities
- `edge-client-stream-route`: 「后端代理接口」需求变化——为 Stream Route 写入补载荷校验（Edge 侧不校验，平台必须拦）；「操作列」需求新增添加/编辑入口

## Impact

- 后端：`backend/app/api/v1/edge_client.py`（stream route 写端点补内联请求模型与校验）、`backend/app/core/audit_hook.py`（ROUTE_MAP 3 条）
- 前端：`frontend/src/views/EdgeClient.vue`（工具条按钮、行内编辑、弹窗表单、合并提交）、新增 `frontend/src/utils/edgeStreamRoute.ts`（校验与载荷合并纯函数）、`frontend/src/config/auditResourceRoutes.ts`（标签）
- 测试：`backend/tests/test_edge_client_api.py`、`frontend/src/utils/__tests__/edgeStreamRoute.test.ts`、`frontend/e2e/edge-client.spec.ts`
- 依赖：无新增依赖，无新增数据表；不引入平台侧版本快照/发布流程（直连即直改节点，与既有删除一致）
- **非目标**：不做 JSON 编辑模式（现有「JSON」按钮保持只读）；不做健康检查 / 重试 / keepalive 等高级字段的表单编辑（编辑时原值保留不丢）；不覆盖四层代理在平台侧的集群化管理
