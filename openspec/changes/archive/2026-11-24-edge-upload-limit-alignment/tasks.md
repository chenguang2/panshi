# Tasks

## 1. 后端纯函数与文本级注入（TDD 先红）

- [x] 1.1 新增 `backend/app/services/edge_env_limits.py`：`EDGE_ADMIN_BASELINE_MB = 32`、`parse_admin_body_limit_mb(content) -> int|None`、`effective_limit_mb(content) -> int`、`ensure_admin_limit(content, platform_mb) -> (new_content, action, old_mb)`（action ∈ inserted/raised/kept/absent；文本级行扫描，保留注释与顺序）。验证：`tests/test_edge_env_limits.py`。
- [x] 1.2 新增 `backend/tests/test_edge_env_limits.py`，用**真实节点 edge.env 文本**做夹具（含 `## http 模块` 注释块、`#client_max_body_size: 32m` 注释行、`admin:` 无该键等形态）：①`http` 级有 132m 而 admin 缺失 → effective=32、action=inserted；②admin=32m + 平台 132 → raised、只差一行；③admin=256m → kept；④插入后除目标行外逐行不变（快照对比）；⑤`admin:` 缩进变体（2/4 空格）都能定位；⑥非法 YAML 不写入。验证：先 RED（实现前失败）。
- [x] 1.3 GREen：跑通 1.2，并跑 `pytest tests/test_edge_env_limits.py -q`。

## 2. 部署链注入与读取诊断

- [x] 2.1 `app/schemas/edge_env.py`：新增 `EdgeEnvLimits`（platform_mb/admin_mb/effective_mb/sufficient/note），`EdgeEnvReadResponse` 增 `limits` 字段。
- [x] 2.2 `app/api/v1/cluster_edge_env.py::read_edge_env`：用 1.1 纯函数计算诊断并返回（不额外触网——内容本就来自节点读取）。
- [x] 2.3 `app/api/v1/cluster_edge_env.py::deploy_edge_env`：校验通过后调用 `ensure_admin_limit(request.content, static_zip_max_mb())`，用注入结果作为 `env_content` 下发；SSE 首部推一行中文说明（inserted/raised 时；kept/absent 不强推，absent 时推提示「未定位到 http.admin，请检查结构」）。验证：`tests/test_edge_env_deploy_limit*.py` 新增用例 + 既有部署用例按 design D8 调整。
- [x] 2.4 回归 `pytest -k "edge_env" -q` 全绿。

## 3. 中继网关腿

- [x] 3.1 `app/services/relay_init.py::render_relay_server_conf`：server 块内写 `client_max_body_size {static_zip_max_mb()}m;`。验证：`tests/test_relay_init.py` 结构断言补该行（design D8）。
- [x] 3.2 确认 `GET /relay/gateways/{id}/config-preview` 与 init 同源（复用同一函数），补一条断言「预览含该行」。验证：`pytest -k "relay" -q` 全绿。

## 4. 前端

- [x] 4.1 新增 `frontend/src/utils/edgeEnvLimits.ts`（`parseAdminBodyLimit(content, unit='m')` + `describeLimitGap(content, platformMb)` 纯函数，公式与后端 D2 逐字对齐）+ 单测。
- [x] 4.2 `api/edgeEnv.ts` / `types` 补 `limits`；`views/EdgeEnv.vue` 状态条旁新增诊断/警示条（充足灰字、不足警示），编辑态变化时按 4.1 显示「部署时将自动补齐到 {N}MB」。验证：组件测试新用例（既有断言不动）。
- [x] 4.3 `npx vue-tsc -b` 干净；`npx vitest run` 相关文件全绿。

## 5. 文档与真机验收

- [x] 5.1 `AGENTS.md` 约定 #50：补一句「Edge 上限与网关 8443 上限已由平台按 `limits.static_zip_max_mb` 自动对齐（部署 edge.env 注入 `http.admin.client_max_body_size`、渲染网关 server 块）；手改生成文件无效」。
- [x] 5.2 真机验收（集群 `static-file` / 节点 192.168.0.13）：①「读取节点配置」→ 诊断显示 effective=132（当前已手工对齐）；②把内容里 admin 段该行删掉再「部署」→ 观察 SSE 补齐说明；③部署后节点 `grep client_max_body_size conf/nginx_server_monitor.conf` = 132m；④发布 66MB 静态资源成功。验证：截图 + 命令输出存档。
- [x] 5.3 `openspec validate --all` 0 error；`pytest` 域回归 + `vitest` 域回归全绿。
