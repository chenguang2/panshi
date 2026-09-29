# async-io-offloading（异步端点阻塞 IO 卸载）

## Purpose

保证 async 端点内的一切阻塞 IO（EdgeClient HTTP 调用、openssl 子进程证书生成、数据库归档导出/导入）经 `asyncio.to_thread` 卸载到线程执行，事件循环在网络/子进程/长 IO 期间保持可响应其他请求；并以源码级守卫测试固化该约束，防止回归。落地于 OpenSpec 变更 `edge-client-async`（2026-09-29，代码评审报告 H1 项）。

## Requirements

### Requirement: async 端点内的 Edge HTTP 调用必须卸载到线程

系统 SHALL 保证所有在 `async def` 上下文中执行的 EdgeClient HTTP 调用（含发布、删除、静态资源 zip 下发、edge-client 直连端点）经 `asyncio.to_thread` 或既有 `run_edge_sync` 封装执行，事件循环在网络 IO 期间 SHALL 保持可响应其他请求。

#### Scenario: 多节点发布期间其他 API 保持响应

- **WHEN** 对包含多个节点的集群执行配置发布，某节点网络不可达（连接等待最长 5 秒）
- **THEN** 发布请求逐节点正常执行且结果与串行语义一致
- **THEN** 发布期间后端健康检查、登录与其他 API 请求不被阻塞

#### Scenario: 逐节点结果标注语义不变

- **WHEN** 仅网络调用（`publish_fn`、`post_publish_fn`、`edge_delete_fn`）经 `asyncio.to_thread` 在 worker 线程执行，EdgeClient 构造、`mark_route`、逐节点日志留在事件循环
- **THEN** 每节点结果的 `route`/`relay_via` 标注仍在请求发起前写入（失败节点也带）
- **THEN** 逐节点日志时序（成功日志夹在 publish 与 post 之间）、成功/失败计数与响应结构与既有行为完全一致

#### Scenario: edge-client 直连端点统一封装

- **WHEN** `/edge-client` 路由下的任意 async 端点调用 EdgeClient 方法
- **THEN** 该调用 SHALL 经 `run_edge_sync`（或 `asyncio.to_thread`）执行，不允许裸同步直调

### Requirement: 同步子进程与归档 IO 必须卸载到线程

系统 SHALL 保证证书生成（openssl subprocess，含 CA/证书签发、`detect_openssl`、`get_cert_expiry`）与数据库归档导出/导入在 async 端点内经 `asyncio.to_thread` 执行。

#### Scenario: 证书生成不阻塞事件循环

- **WHEN** 用户发起 SM2 双证书生成（底层串行执行多次 openssl 子进程）
- **THEN** 生成过程在线程中执行，期间其他 API 请求保持响应
- **THEN** 生成结果（证书文件、返回结构）与既有行为完全一致

#### Scenario: 归档导出/导入不阻塞事件循环

- **WHEN** 用户发起数据库归档导出或导入（zip 打包/解包长 IO）
- **THEN** service 调用在线程中执行，期间其他 API 请求保持响应
- **THEN** 归档文件产物与导入语义与既有行为完全一致

### Requirement: 源码守卫固化卸载约束

系统 SHALL 提供源码级守卫测试，扫描指定 async 端点与编排函数体：发布/删除编排、静态资源发布、证书生成、归档导出导入、集群删除流函数体 MUST 含 `asyncio.to_thread`；`api/v1/edge_client.py` 全部 async 端点 MUST NOT 含裸同步 EdgeClient 直调。

#### Scenario: 新增裸同步调用被守卫拦截

- **WHEN** 开发者在受约束的 async 函数体内新增裸同步 EdgeClient 调用或同步 subprocess/归档直调
- **THEN** 守卫测试失败并指明违规文件与函数
