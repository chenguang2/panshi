# Proposal: edge-client-async（H1 事件循环阻塞治理）

## Why

EdgeClient 全同步（httpx 顶层函数），且证书生成（openssl subprocess）、数据库归档（zip 打包/解包）两条同型腿也是同步 IO，全部直跑在 async 端点内阻塞事件循环。后果：逐节点发布 N×5s 串行、SM2 证书生成最多 7 次 openssl 子进程（各 timeout 30s）、整库归档打包期间，**整个后端无响应**（健康检查/登录/其他 API 全部堵死）。这是 `docs/refactoring/code-review-report-2026-09-28.md` 的 H1 项，当批修复刻意搁置、单独立项。

## What Changes

- `edge_sync.py`：`publish_to_nodes`(:396) / `delete_on_nodes`(:343) 逐节点同步调用（`publish_fn(client)` / `edge_delete_fn(client, uuid)`）改为 `asyncio.to_thread` 卸载，事件循环在每节点网络 IO 期间保持响应
- `cluster_static_resources.py`(:487)：逐节点 `client.raw_put(path, zip_data)`（timeout=30）循环同样 to_thread 卸载
- `cluster_ssl.py`：`_generate_local`(:532/:544) 证书生成（内含 openssl subprocess）及 `_apply_cert_chain` 钩子（:375-377 `detect_openssl`/`get_cert_expiry`）to_thread 卸载
- `database.py`：`export_archive`(:609) / `import_archive`(:635) 同步归档 service 调用 to_thread 卸载
- `clusters.py`：集群删除流(:291-312)逐节点 `client.delete_*` 裸同步调用 to_thread 卸载（连接测试 :417 已是正确范例）
- `api/v1/edge_client.py`：其余 ~20 个裸调同步方法的端点统一走既有 `run_edge_sync`（to_thread + wait_for）封装
- 新增**源码守卫测试**：扫描 async 端点/编排函数体，禁止裸同步 EdgeClient 调用与同步 subprocess/归档直调（防未来回归，同 `test_publish_response.py` 守卫模式）
- **不改** EdgeClient 类本身（保持同步实现与公开 API）、**不改**发布/删除编排语义（串行顺序、日志、`route`/`relay_via` 标注、异常映射均不变）、**不做** httpx.AsyncClient 全量重写（见 design.md 备选论证）

## Capabilities

### New Capabilities

- `async-io-offloading`: async 端点与编排层内的阻塞 IO（Edge HTTP 调用、openssl 子进程、数据库归档打包）必须卸载到线程执行，保证事件循环在长 IO 期间持续响应其他请求；附源码级守卫测试固化该约束

### Modified Capabilities

（无 —— 现有 specs（shared-publish-flow、cluster-static-resource-publish、ssl-certificate-generation、database-management 等）描述的外部行为与 API 契约均不变，本次仅改变执行模型）

## Impact

- **代码**：`backend/app/services/edge_sync.py`、`backend/app/api/v1/cluster_static_resources.py`、`cluster_ssl.py`、`database.py`、`clusters.py`、`edge_client.py`（路由文件）
- **测试**：`test_publish_response.py` 守卫兼容性复核（端点保持 `async def` 与函数体形态不变即不受影响）；新增源码守卫测试；回归跑 `pytest -k "edge or publish or ssl or archive"` 涉及共享编排需跑全量
- **无** API 契约/依赖/前端变化（仅标准库 asyncio）
- **风险**：to_thread 线程内的 EdgeClient 构造含同步 `db.query`（`_resolve_edge_url`），须与调用一并进线程，避免留下残余阻塞点
