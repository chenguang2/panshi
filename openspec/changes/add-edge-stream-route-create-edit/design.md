## Context

Edge 直连页（`frontend/src/views/EdgeClient.vue`）以「节点 + 端口」为入口直连 Edge Admin API，「四层代理」Tab 目前只有列表 / JSON 查看 / 删除。该 Tab 的既有能力由 `edge-client-stream-route` 规格约束。

本变更有真实测试节点（`192.168.0.13:16620`，平台节点 id=11 / 集群「演示集群」），因此下述事实**均为实测**而非文档推断：

| 事实 | 证据（实测） |
|---|---|
| `POST /stream/edge/admin/routes`（集合创建）**可用** | 空载荷 `{}` → HTTP 200，节点上多出一条路由（32 位 hex id），已删除复原 |
| Edge 创建时**不校验载荷** | 同上：`{}` 也能创建出既无 `server_port` 也无 `upstream` 的路由 |
| 节点上 id 格式**不统一** | 既有两条为 UUID 带横线（`ce6ea88d-…`），POST 新建的为 32 位 hex |
| 线上路由带表单不覆盖的字段 | 既有路由含 `upstream.checks`、`upstream.pass_host`；DNS 那条含 `plugins.dns_upstream` |
| `protocol` 取值 `TCP`/`UDP` | DNS 那条为 `UDP`，转发那条为 `TCP` |
| 删除接口可用 | `DELETE …/routes/{id}` → `{"action":"delete","deleted":"1"}` |
| 平台侧 PUT 写入已被验证 | `cluster_stream_proxies.py` 发布即用 `client.api("stream_route","update",edge_uuid,body)` |

> 记录一次被证伪的假设：设计初稿曾据 `docs/edge/user-guide/使用手册.md`（只列 GET/PUT/DELETE）与"无人调用"推断"Edge 无集合级 POST 创建"，并据此计划把创建改成 PUT-with-id。真实节点探测直接证伪了该推断——文档未列 ≠ 不支持，且空载荷探测暴露出真正的问题在"缺校验"而非"缺端点"。故本设计不再改动创建语义。

## Goals / Non-Goals

**Goals**

- 「四层代理」Tab 具备**添加**与**编辑**入口，字段覆盖直连场景的常用项
- 写入在**平台侧**得到校验：无效载荷不得落到节点上
- 编辑为全量替换时**不丢字段**（`upstream.checks`、`plugins` 等保持原值）
- 写操作审计归属正确（`edge_stream_route` 而非 `edge_node_*`）

**Non-Goals**

- 不做 JSON 编辑模式（现有「JSON」按钮保持只读）
- 不做健康检查 / 重试 / keepalive 等高级字段的表单编辑（编辑时原值保留）
- 不引入平台侧配置版本快照与发布流程——直连写节点与既有删除语义一致，明确绕过同步
- 不做"直连新建的四层代理反向导入平台集群"（属 Edge 数据导入链路）
- 不支持 `server_ports`（多端口数组）——线上未见使用，需要时再评估

## Decisions

### D1：创建仍用 POST 集合，不改 PUT-with-id

- 采纳：`POST /edge-client/nodes/{ip}/{port}/stream-routes` → `client.create_stream_route(data)` → `POST /stream/edge/admin/routes`，由 Edge 分配 id
- 备选（PUT-with-id，初稿方案）：实测无必要；且会把 id 生成与 id 格式责任揽到平台侧，而节点上本就并存两种 id 格式
- 理由：与同页「上游」「路由」Tab 的"创建 POST / 更新 PUT"范式一致；现有后端实现可用，改动面最小
- 代价：POST 非幂等，重复提交会产生重复路由 → 由提交中禁用按钮缓解（`submitting` 态）

### D2：写入校验放在平台侧（本次唯一的后端逻辑改动）

Edge 对空载荷返回 200 并创建垃圾路由，**校验只能在平台侧做**。后端为写端点补内联请求模型：

- `server_port`：必填，1–65535（Edge 侧不做该约束）
- `upstream`：必填，且 `upstream.nodes` 至少一个节点（无 upstream 的四层代理是无效配置——流量无处可去）
- 非法载荷 → 4xx，且**不向 Edge 发起任何请求**
- 备选（前端校验即可）：前端校验只保护 UI 路径，脚本/直接调 API 仍会污染节点，排除
- 前端另有一层校验（D6）用于即时反馈，二者有意冗余

### D3：编辑以完整对象为基底并**深合并 `upstream`**

`PUT` 是全量替换。仅发表单字段会丢 `upstream.checks`、`upstream.pass_host`、`plugins` 等（实测线上路由均有这些字段）。

做法：以该行完整对象（`record.value`，列表已返回）为基底，顶层写回表单字段，并**向 `upstream` 内部做浅合并**后整体提交；`upstream.nodes` 由表单全权覆盖，`upstream` 内其它键（checks / pass_host / …）保持原值。

- 备选（只做顶层合并）：`upstream` 被整体替换，`checks`/`pass_host` 丢失，排除
- 代价：行数据可能略旧。用户保存前看到的就是该行数据，且表单字段必然覆盖，可接受

### D4：表单字段 = 直连场景常用集，与上游 Tab 对齐

- 顶层：监听端口（必填）、名称、协议（TCP/UDP）、SNI、remote_addr
- `upstream`：类型（roundrobin/chash/ewma/least_conn）、协议（tcp/tls/udp）、节点+权重（可增删）、`chash` 时 hash_on + key
- 理由：与同页上游 Tab 的粒度一致；直连面向"快速补一条/改一条"，把集群侧的 checks/keepalive/retries 全搬进来会让直连表单比集群表单更重，而这些字段在编辑时已被保留

### D5：协议下拉只暴露 TCP/UDP

Edge 顶层 `protocol` 实测取 `TCP`/`UDP`；TLS 由 `upstream.scheme="tls"` 表达（`_edge_protocol` 注释同此）。表单按此收敛，避免用户选出 Edge 不认的值。

### D6：监听端口冲突在提交前拦截

列表已持有全部 `server_port`，提交前比对即可给出"端口已被占用"的明确提示；否则用户看到的只是路由建好但流量异常。

### D7：审计用显式映射，resource = `edge_stream_route`

现状：`/api/v1/edge-client/nodes/{ip}/{port}/stream-routes/*` 落到词汇推断，`nodes` → `node` 且 `is_edge` → 记成 `edge_node_create/update/delete`，语义错误（实际动的是四层代理）。本变更在 `ROUTE_MAP` 补三条显式映射，前端 `auditResourceRoutes.ts` 补标签。

### D8：id 一律按不透明字符串处理

实测同一节点上并存 UUID（带横线）与 32 位 hex 两种 id。前端不做数值/格式假设，编辑时原样透传。

## Risks / Trade-offs

- [Edge 无校验 → 无效路由落库] → D2 平台侧校验（已实测确认必要）
- [全量替换丢字段] → D3 深合并；e2e 断言"编辑后原 `plugins`/`upstream.checks` 仍在"
- [POST 非幂等，重复点击产生重复路由] → 提交中禁用按钮 + 成功后关弹窗并重载
- [端口冲突已存在两条路由] → D6 前置拦截；不改动既有数据
- [直改节点绕过平台版本管理] → 与既有删除一致，弹窗文案提示"绕过同步流程；如需纳入平台管理请在集群侧创建后发布"
- [表单字段与 Edge 演进漂移] → D3 深合并保证 Edge 新增字段不会因本表单丢失
- [写入校验过严挡住合理配置] → `server_port` 范围按标准端口定义；`server_ports`（多端口）暂不支持，已在非目标中标注

## Migration Plan

纯前后端代码 + 审计映射与标签，无数据迁移、无新增依赖。回滚 = revert。已在测试节点上验证过的写入/删除不依赖本变更（节点侧配置本就在）。

## Open Questions

- 是否需要支持 `server_ports` 多端口数组？线上未见使用，需要时再评估
- 直连新建的四层代理是否需要一键"导入平台集群"？属 Edge 数据导入链路，本变更不做
