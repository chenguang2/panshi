# Design: edge-client-async（H1 事件循环阻塞治理）

## Context

盘点结论（2026-09-28 实测代码，详见 code-review-report-2026-09-28.md H1 项 + 本变更盘点记录）：

- `edge_client.py`（718 行）全同步：`_request`(:209-293) 按 method 分支直调 `httpx.get/post/put/patch/delete(..., timeout=5.0)`(:239-250)；`raw_put`(:332, timeout=30)、`raw_delete`(:687, timeout=10)。SM4 加密封在 `_request` 层。无任何 async 痕迹。47 处实例化点，每请求/每节点新建实例。
- `edge_sync.py`：`publish_to_nodes`(:353-425) / `delete_on_nodes`(:313-350) 是 async def 但逐节点循环体纯同步——`response = publish_fn(client)`(:396) / `edge_delete_fn(client, edge_uuid)`(:343) 直接调用。8 处 publish_fn lambda + 12 处 delete lambda 分布在 9 个 route 文件。`batch_load_cluster_stats` 本就纯异步，**不是**阻塞点。
- 同型腿：`cluster_ssl.py`(:532/:544) 证书生成同步调 openssl（`cert_generator._run_openssl` subprocess timeout=30，SM2 = 7 次串行子进程）；`_apply_cert_chain` 钩子(:375-377) `detect_openssl`/`get_cert_expiry` 同步。`database.py`(:609/:635) 归档导出/导入同步。`cluster_static_resources.py`(:487) 逐节点 `raw_put` zip。
- `api/v1/edge_client.py`：已有 `run_edge_sync`（to_thread + wait_for）helper(:18-25)，但仅 9 个列表端点使用，其余 ~20 个端点裸调。
- 正确范例：`clusters.py:417`（`await asyncio.to_thread(client.list_available_plugins)`）、`relay_health.py:69`、`api/v1/edge_client.py::run_edge_sync`。
- 守卫约束：`test_publish_response.py` 用正则抽 4 个 `async def` 函数体断言 `build_publish_response`/`publish_resource(`/`version` —— 端点形态不能变。

## Goals / Non-Goals

**Goals:**

- 事件循环在所有已识别的长 IO 期间（Edge HTTP、openssl 子进程、归档打包）保持响应：健康检查/登录/其他 API 不再被单个慢节点或证书生成堵死
- 发布/删除编排外部语义零变化：串行顺序、逐节点日志时序、`route`/`relay_via` 标注（请求发起前写入，失败节点也带）、异常类型（`EdgeConnectionError`/`EdgeAPIError`）、响应结构全部不变
- 源码守卫测试固化约束，防未来新增调用点回归
- 单实现原则（约定 #18/#24）：所有卸载收敛到 `asyncio.to_thread`（编排内联循环）与 `run_edge_sync`（edge-client 路由端点）两个入口

**Non-Goals:**

- 不重写 EdgeClient 为 httpx.AsyncClient（见 Decision 1 备选论证）
- 不把逐节点串行循环改并发（gather）——行为变化另立变更
- 不改任何 API 契约、前端、依赖
- 不动 relay_health（已正确）、不动 `clusters.py:417` 连接测试（已是范例）

## Decisions

### Decision 1: 调用点 to_thread 卸载，而非 EdgeClient 异步化重写

**选择**：在 ~10 个阻塞咽喉点用 `asyncio.to_thread` 卸载，EdgeClient 保持同步实现。

**理由**：

1. 改动面：AsyncClient 版需要 ~30 个公开方法的异步双轨或全量迁移、47 个实例化链、8+12 处 lambda 全部变 async、所有 mock `_request`/`raw_put` 的测试重写；to_thread 方案只动 6 个文件的咽喉行
2. 收益面：本平台是低 QPS 管理面，to_thread 已彻底消除事件循环阻塞；AsyncClient 的连接池收益对「每请求新建 EdgeClient」的现有形态无意义
3. 仓库判据（AGENTS.md #11）：LLM 维护仓库，最小 diff 与单点可发现性优先
4. 守卫兼容：端点保持 `async def` 且仍委托 `publish_resource`，`test_publish_response.py` 正则不受影响

**备选（否决）**：EdgeClient 出 AsyncClient 双 API —— 结构更干净，但风险/收益不成比例；留作后续独立演进（见 Open Questions）。

### Decision 2: 编排层卸载粒度 = 整个逐节点同步工作进线程，不是只包 publish_fn

`publish_to_nodes` 每节点的闭包覆盖：**EdgeClient 构造 + `mark_route` + `publish_fn(client)` + `post_publish_fn`**。理由：

- `EdgeClient.__init__ → _resolve_edge_url` 含同步 DB 查询（:123-141），构造留在事件循环仍是阻塞点
- `mark_route`(:393) 需要 client 实例（读 `relay_target` 写 `route`/`relay_via`），必须在构造后、请求前执行——进同一闭包即天然保序
- `post_publish_fn`（如 plugin_metadata 的 `client.reload_plugins()`）是同 client 上的又一同步 EdgeClient 调用，同闭包
- 闭包把结果写进可变 holder（dict/list）或直接 return，`log_fn` 留在事件循环按原时序执行（edge_logger 文件追加是小同步写，不值得再拆）

线程安全论证：同一节点的构造+请求+post 钩子在**同一个 worker 线程内串行**完成，无跨线程共享可变状态；`node_result` dict 的写入发生在闭包内，GIL 下单键赋值安全。`db` 会话若被 `_resolve_edge_url` 使用，同样只在单线程串行路径触碰。

`delete_on_nodes`(:343) 同型处理。异常传播：`to_thread` 原样透传异常，:411 的 `except (EdgeConnectionError, EdgeAPIError)` 无需改动。

### Decision 3: api/v1/edge_client.py 裸调端点统一迁入既有 `run_edge_sync`

单实现原则：helper 已存在（to_thread + wait_for），仅迁移 ~20 个裸调端点（get_upstream:151、create/update/patch/delete upstream、route 同组、global_rule 同组、plugin_config 同组、plugin_metadata 同组、ssl :494/506/517、reload_plugins:543、stream_route create/update/delete）。外层 `wait_for(10s)` > 内层 httpx timeout 5s，超时语义与已迁移的 9 个端点一致，不新增错误形态。

### Decision 4: 证书生成与归档 = `asyncio.to_thread` 包裹 service 调用

- `cluster_ssl.py::_generate_local`：:532/:544 两次生成调用包 to_thread；`_apply_cert_chain` 钩子的 `detect_openssl`/`get_cert_expiry`(:375-377) 同包
- `database.py`：:609 `db_archive_service.export_archive`、:635 `import_archive` 包 to_thread（service 签名不变）
- **备选（否决）**：`asyncio.create_subprocess_exec` 重写 cert_generator 底层 —— 收益同 to_thread 但要重写 openssl 调用层与超时/编码处理，改动不成比例

### Decision 5: 源码守卫测试防回归

新增 `backend/tests/test_async_offloading_guard.py`，同 `test_publish_response.py` 的正则抽函数体模式：

- 断言 `publish_to_nodes` / `delete_on_nodes` / `publish_static_resource` / `_generate_local` / `export_archive` / `import_archive` / clusters 删除流函数体含 `asyncio.to_thread`
- 断言 `api/v1/edge_client.py` 全部 async 端点函数体不含裸 `client.` 直调（须经 `run_edge_sync` 或 to_thread）
- **TDD 顺序（约定 #16）**：先写守卫（RED：扫出全部现存裸调点并验证失败）→ 逐咽喉点修复（GREEN）→ 全量回归

## Risks / Trade-offs

- [线程内 `_resolve_edge_url` 同步 DB 查询的会话线程安全] → 构造与请求在同一 worker 线程串行，无并发共享；实现时确认传入会话类型并在守卫测试中保持该形态
- [to_thread 默认线程池占用（raw_put 30s 长任务）] → 逐节点串行循环同时至多 1 线程；管理面低并发；edge-client 端点有 wait_for 兜底
- [事件循环解放后并发写请求增多，SQLite 写锁竞争面变大] → 遵循约定 #29 既有范式（外部 IO 前 commit 释放锁）；本变更不新增写库路径
- [`test_publish_response.py` 守卫误伤] → 端点保持 `async def` + 委托 `publish_resource` 不变；实现后显式跑该文件
- [正则守卫的脆弱性] → 宽松断言（函数体含 `asyncio.to_thread`/`run_edge_sync` 即可），不做精确 AST 匹配；断言清单与咽喉点清单一一对应，漂移即红

## Migration Plan

单分支落地，TDD 推进（tasks.md 逐项）。无 schema/迁移/写库路径改动（归档导出只读源库）——按约定 #31 不触发 PG 方言冒烟强制项，但实现后仍跑一次全量 pytest（含 PG 可选组）确认零回归。回滚 = revert 单分支。

## Open Questions

- 后续是否演进 EdgeClient AsyncClient 版（连接池 + 原生并发）——本变更明确不做，留档待低峰期评估；届时 `publish_to_nodes` 串行改并发是同一批议题
