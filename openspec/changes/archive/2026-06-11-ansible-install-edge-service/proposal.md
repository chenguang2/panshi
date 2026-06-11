## Why

当前 Ansible 已存在 `install_openresty.yml` 和 `install_edge.yml` 两个 playbook task，但后端 `AnsibleRunnerService` 和 API 层尚未暴露对应的执行入口。运维人员无法通过平台界面触发远程 OpenResty 和 Edge 的安装操作。需要封装这两个命令，使其可通过 REST API 调用并实时流式返回安装日志。

## What Changes

- 后端 `ALLOWED_TAGS` **不注册** `install_openresty`、`install_edge`（走专用 SSE streaming 端点，避免通用接口滥用）
- `AnsibleRunnerService` 新增 `install_openresty()` 和 `install_edge()` 两个方法，封装 `run_playbook()` 调用
- 新增 SSE streaming 端点 `POST /clusters/{id}/nodes/{id}/install-openresty` 和 `POST /clusters/{id}/nodes/{id}/install-edge`，流式返回 ansible 实时输出（首批仅单节点）
- 前端新增安装命令入口和流式日志展示组件（基于改造后的 `NodeExecutionResultDrawer`）

## Capabilities

### New Capabilities
- `ansible-install-streaming`: 基于 SSE 的 Ansible 安装日志实时流式传输
- `install-openresty`: 远程安装 OpenResty 服务
- `install-edge`: 远程安装 Edge 服务

### Modified Capabilities
- `node-action-progress-dialog`: 执行结果展示组件需支持流式日志追加（当前为一次性设置 props）

## Impact

- 后端: `ansible_service.py` 新增 `ALLOWED_TAGS` + 安装方法 + SSE 异步生成器
- 后端: `cluster_nodes.py` 新增 SSE streaming 端点
- 后端: 可能新增 `sse-starlette` 依赖（或直接用 `StreamingResponse`）
- 前端: `useClusterNodes.ts` 新增 EventSource 流式消费逻辑
- 前端: `NodeExecutionResultDrawer.vue` 改造为支持流式追加日志
- 前端: ClusterNodes.vue / NodeList.vue 新增安装操作按钮
