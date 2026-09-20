## 1. 后端：stream route 写入校验（TDD，先红后绿）

- [x] 1.1 `backend/tests/test_edge_client_api.py` 新增用例并确认先失败：① 缺 `server_port` → 4xx 且**不触达 Edge**（monkeypatch 断言 `create_stream_route` 未被调用）；② `server_port` 越界（0 / 65536）→ 4xx；③ `upstream.nodes` 为空或缺 `upstream` → 4xx；④ 合法载荷 → 调用 `create_stream_route`；⑤ 更新使用请求路径中的 id；⑥ **未知顶层字段（如 `plugins`）在写载荷中保留**（守住"不丢字段"契约）
- [x] 1.2 `backend/app/api/v1/edge_client.py` 新增内联 `StreamRouteCreate` / `StreamRouteUpdate`：`model_config = ConfigDict(extra="allow")`（保全未知字段）、`server_port: int = Field(ge=1, le=65535)`、`upstream` 必填且经 `field_validator` 断言 `nodes` 非空
- [x] 1.3 创建/更新端点由 `data: dict` 改为模型入参，并以 `model_dump(exclude_unset=True)` 构造转发载荷（保留未知字段、不注入未提供的可选键）
- [x] 1.4 `backend/tests/test_edge_client_api.py` 转绿

## 2. 审计映射与标签

- [x] 2.1 `backend/app/core/audit_hook.py` 的 `ROUTE_MAP` 补三条显式映射：`POST …/stream-routes` → `("edge_stream_route","create",False)`、`PUT …/stream-routes/{route_id}` → `update`、`DELETE …` → `delete`
- [x] 2.2 `backend/tests/test_security_guard.py` 的 `UNAUTHENTICATED_SAMPLES` 补 stream-routes 的 POST / PUT / DELETE 采样
- [x] 2.3 `frontend/src/config/auditResourceRoutes.ts` 补 `edge_stream_route: 'Edge 四层代理'`，并在其配置测试中断言标签

## 3. 前端：四层代理添加与编辑

- [x] 3.1 新增 `frontend/src/utils/edgeStreamRoute.ts` 纯函数：`validateStreamRouteForm(form, rows)`（必填、端口 1–65535、至少一个上游节点、与列表内其它路由端口冲突）与 `buildStreamRoutePayload(form, base?)`（顶层写回表单字段、`upstream` 内浅合并、`nodes` 由表单全权覆盖）
- [x] 3.2 新增 `frontend/src/utils/__tests__/edgeStreamRoute.test.ts`：校验消息与端口冲突；创建无 base 时载荷不含空字段；编辑时保留 `plugins`、`upstream.checks`、`upstream.pass_host`；`chash` 含 hash_on/key、非 chash 不含
- [x] 3.3 `frontend/src/views/EdgeClient.vue`「四层代理」Tab 工具条新增「添加四层代理」按钮；「操作」列在 JSON 与删除之间插入「编辑」
- [x] 3.4 表单弹窗（沿用上游弹窗的 `modal-overlay` + `.form-group` 结构）：监听端口、名称、协议（TCP/UDP）、SNI、remote_addr、上游类型/协议、节点+权重（可增删）、`chash` 时显示 hash_on + key
- [x] 3.5 创建调用 `POST /edge-client/nodes/{ip}/{port}/stream-routes`；编辑以该行完整对象为基底合并后调用 `PUT /edge-client/nodes/{ip}/{port}/stream-routes/{原 id}`
- [x] 3.6 提交中禁用提交按钮；成功后关闭弹窗、`loadData()` 重载列表并提示成功；失败时提示错误且不关闭弹窗、保留用户输入
- [x] 3.7 弹窗内提示"直连写节点、绕过平台同步流程"

## 4. 验证

- [x] 4.1 `cd backend && uv run pytest tests/test_edge_client_api.py tests/test_security_guard.py`
- [x] 4.2 `cd frontend && npx vitest run && npx vue-tsc -b && npx npx eslint src && npx prettier --check src`
- [x] 4.3 `frontend/e2e/edge-client.spec.ts` 新增用例（沿用既有 `queryFirstNode` + `test.skip('无集群/节点数据')` 环境守卫）：工具条按钮与行内编辑可见、弹窗字段齐全、必填与端口冲突被拦截、用 `page.route` 拦截 `**/stream-routes*` 断言创建载荷含 `server_port` 与 `upstream.nodes`、编辑载荷保留原有 `plugins`
- [x] 4.4 **真机链路（测试节点 192.168.0.13:16620，必做）**：经平台接口新建一条四层代理 → 列表出现该路由 → 编辑改监听端口 → 列表反映新端口 → **断言原 `plugins` / `upstream.checks` 仍在** → 删除并确认节点恢复原状（既有 2 条路由不受影响）
- [x] 4.5 非法载荷真机回归：直接 `POST` 缺 `server_port` 的载荷 → 4xx，且节点路由数不变

## 5. 实测记录（2026-09-16，测试节点 192.168.0.13:16620）

- 探测纠偏：`POST /stream/edge/admin/routes` 空载荷 `{}` → HTTP 200 且**真的创建**了一条无 `server_port`/无 `upstream` 的路由（已删除复原）。据此把设计初稿的"Edge 无集合级 POST，需改 PUT-with-id"改为"创建仍用 POST，真正的缺口是平台侧缺校验"（详见 design.md Context 与 D1/D2）
- 非法载荷真机回归：缺 `server_port`、空 `upstream.nodes` 均返回 422，且节点路由数不变（校验确实拦在平台侧）
- 真机链路（脚本）：新建（带 `upstream.checks`/`pass_host`）→ 列表新增 → 编辑（前端式合并载荷）→ **`checks`/`pass_host` 仍在**、端口/名称/节点已更新、id 未变 → 反证：朴素载荷（仅表单字段）PUT 后 `checks` 确实丢失 → 删除 → 节点恢复原 2 条、既有路由未被改动
- 真机 UI 链路（Playwright 真实写入）：弹窗字段齐全 → 缺端口与端口冲突均未发出请求 → 新建真实落节点 → 编辑回填正确、**PUT 载荷保留 `upstream.checks`/`pass_host` 且不含 `id`/`create_time`/`update_time`** → UI 删除两条临时路由 → 节点恢复基线、无 console 错误
- `plugins` 真机保全未能取证：Edge 校验插件 schema（`log_syslog` 需要 `logs`），探针配置被 400 拒绝；该字段的透传由后端未知字段单测（`test_unknown_fields_forwarded_untouched`）与前端单测（用线上真实 DNS 路由对象）覆盖
- 顺带修复：`e2e/edge-client.spec.ts` 的 `beforeEach` 原本用 `page.click('text=Edge直连')` 导航，而该菜单项在二级菜单默认收起时不可见 → 该 spec 13 个用例**原本全红**；改为与 `ansible-inventory.spec.ts` 一致的 URL 导航后 11 通过 / 2 skip（2 个 skip 是既有的 `.ant-table-header` 环境守卫，与本次改动无关）
- 已知既有失败：`tests/test_route_list_api.py::test_list_routes_plugin_filter_reduces_count`（隔离库无 proxy_rewrite 路由，与本变更无关）
