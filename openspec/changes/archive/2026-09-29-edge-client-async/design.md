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

### Decision 2: 卸载边界 = 网络调用进线程，构造/标注/日志留事件循环（2026-09-29 审查修正）

原表述「整个逐节点同步工作进线程」经代码复核后修正（用户确认）：

- **实测依据修正**：全部迁移范围内的构造点（`edge_sync.py:392`、`clusters.py:291`、`api/v1/edge_client.py` 全部 29 处）都显式传 `node_ip`+`node_port`，`__init__`(:81-84) 该分支**不调 `_resolve_edge_url`**——构造实际只做 env 读取 + relay 快照内存读，亚毫秒级、非阻塞。原「构造含同步 db.query 阻塞点」的论据在该路径不成立
- **闭包边界（方案 B）**：构造 + `mark_route`(:393) + `_encrypt`(:394) 留在事件循环；仅真正阻塞的网络调用进 `to_thread`。收益：db/会话访问永远留在循环线程，杜绝未来构造改动引入跨线程会话风险
- **两跳时序（log_fn 保序关键）**：`publish_to_nodes` 现序为 `publish_fn`(:396) → `log_fn`(:402-403) → `post_publish_fn`(:405-406) → post_log_fn，log_fn 夹在两次网络调用之间，必须拆两跳：

  ```
  hop1: await asyncio.to_thread(publish_fn, client)
  → 事件循环内 log_fn(...)
  hop2: await asyncio.to_thread(post_publish_fn, client)   # 仅 post_publish_fn 非空时
  → 事件循环内 post_log_fn(...)
  ```

  `log_fn`/`post_log_fn` 一律留在事件循环。**约束：线程闭包内禁止触碰请求级 db 会话**——当前 8+12 处 `publish_fn`/`post_publish_fn` lambda 均为纯 client 调用；未来若新增依赖 db 的钩子，须重新评估边界
- **既有 quirk 原样保留**：post_publish_fn 抛异常时节点先计 success 再计 fail、status 翻转 failed、log_fn 被调用两次——语句顺序不变则行为不变，不修不扩
- `delete_on_nodes`(:343) 单跳：`await asyncio.to_thread(edge_delete_fn, client, edge_uuid)`；异常经 `to_thread` 原样透传，既有 except 分支无需改动

线程安全论证：逐节点 `await` 串行 → 同一编排至多 1 个 worker 线程存活；lambda 只闭包 route 文件局部变量与 client，无共享可变状态；`node_result` 写入全部发生在事件循环。

### Decision 3: api/v1/edge_client.py 裸调端点统一迁入既有 `run_edge_sync`

单实现原则：helper 已存在（to_thread + wait_for），仅迁移 ~20 个裸调端点（get_upstream:151、create/update/patch/delete upstream、route 同组、global_rule 同组、plugin_config 同组、plugin_metadata 同组、ssl :494/506/517、reload_plugins:543、stream_route create/update/delete）。外层 `wait_for(10s)` > 内层 httpx timeout 5s，超时语义与已迁移的 9 个端点一致，不新增错误形态。

**超时不变量（2026-09-29 审查补充）**：`run_edge_sync` 的 timeout MUST 严格大于所包方法的内层 httpx timeout（当前 10 > 5 ✓）。`raw_put` timeout=30、`raw_delete` timeout=10——本文件端点目前均未使用（已核验）；若未来某端点改用，MUST 同步调大该端点的 `run_edge_sync` timeout。

**残余风险（已接受）**：`wait_for` 超时只取消 await，worker 线程不可取消、会继续执行至完成——极端 hang 下 Edge 可能实际配置成功而平台报超时。与既有 9 个已迁移端点行为一致，非本次新增。

### Decision 4: 证书生成与归档 = `asyncio.to_thread` 包裹 service 调用

- `cluster_ssl.py::_generate_local`：:532/:544 两次生成调用包 to_thread；`_apply_cert_chain` 钩子的 `detect_openssl`/`get_cert_expiry`(:375-377) 同包
- `database.py`：:609 `db_archive_service.export_archive`、:635 `import_archive` 包 to_thread（service 签名不变）
- **备选（否决）**：`asyncio.create_subprocess_exec` 重写 cert_generator 底层 —— 收益同 to_thread 但要重写 openssl 调用层与超时/编码处理，改动不成比例

### Decision 5: 源码守卫测试防回归

新增 `backend/tests/test_async_offloading_guard.py`，同 `test_publish_response.py` 的正则抽函数体模式：

- 断言 `publish_to_nodes` / `delete_on_nodes` / `publish_static_resource` / `_generate_local` / `export_archive` / `import_archive` / clusters 删除流函数体含 `await asyncio.to_thread(...)` 调用形态（非仅出现 `to_thread` 字样）
- 断言 `api/v1/edge_client.py` 含 `EdgeClient(` 构造的 async 端点函数体同时含 `run_edge_sync`（构造与卸载同现），且不含裸 `client.` 方法直调
- **TDD 顺序（约定 #16）**：先写守卫（RED：扫出全部现存裸调点并验证失败）→ 逐咽喉点修复（GREEN）→ 全量回归

## Risks / Trade-offs

- [线程闭包触碰请求级 db 会话（未来风险）] → 方案 B 下构造/日志留循环，当前 8+12 处 lambda 均纯 client 调用；设计约束 + 实现处代码注释：线程闭包内禁止触碰请求级 db 会话，新增依赖 db 的钩子须重新评估边界
- [to_thread 默认线程池占用（raw_put 30s 长任务）] → 逐节点串行循环同时至多 1 线程；管理面低并发；edge-client 端点有 wait_for 兜底
- [事件循环解放后并发写请求增多，SQLite 写锁竞争面变大] → 具体场景：归档导入线程写目标库（target==active 时）可与并发 CRUD 在 SQLite 写锁上竞争，慢方经 busy_timeout 兜底后报错；管理面低频导入操作，接受。其余路径遵循约定 #29 既有范式（外部 IO 前 commit 释放锁）；本变更不新增写库路径
- [`test_publish_response.py` 守卫误伤] → 端点保持 `async def` + 委托 `publish_resource` 不变；实现后显式跑该文件
- [正则守卫的脆弱性] → 宽松断言（函数体含 `asyncio.to_thread`/`run_edge_sync` 即可），不做精确 AST 匹配；断言清单与咽喉点清单一一对应，漂移即红

## Migration Plan

单分支落地，TDD 推进（tasks.md 逐项）。无 schema/迁移/写库路径改动（归档导出只读源库）——按约定 #31 不触发 PG 方言冒烟强制项，但实现后仍跑一次全量 pytest（含 PG 可选组）确认零回归。回滚 = revert 单分支。

## Open Questions

- 后续是否演进 EdgeClient AsyncClient 版（连接池 + 原生并发）——本变更明确不做，留档待低峰期评估；届时 `publish_to_nodes` 串行改并发是同一批议题
