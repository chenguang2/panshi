## Why

当前 Edge 网关的 `edge.env` 核心配置文件只能在服务器上手动编辑，运维人员需要 SSH 登录到每个节点修改 YAML 文件并执行 `bin/edge init`。当需要启用 Stream 模式、调整监听端口、开关插件时，操作效率低且容易出错。磐石 Admin 作为统一管理平台，需要提供 edge.env 远程编辑能力，让用户通过界面完成配置修改和部署。

## What Changes

- 新增「edge.env 配置管理」功能，作为集群详情页面的一个独立入口
- 后端提供 REST API：读取 edge.env 内容、写入/部署 edge.env、获取版本历史
- 后端通过 ansible-runner 远程执行 edge.env 的分发和生效（SSH 通道复用已有基础设施）
- 前端提供 YAML 编辑器（Monaco Editor）用于直接编辑完整的 edge.env 文件
- 部署前后自动生成 diff 对比，展示变更内容
- 每次部署生成版本记录，支持查看历史版本和变更内容

## Capabilities

### New Capabilities
- `edge-env-remote-editing`: 远程读取、编辑、部署 Edge 网关的 edge.env 配置文件，包含 YAML 编辑器、diff 对比、版本管理和 ansible-runner 部署

### Modified Capabilities
- `edge-node-lifecycle`: 涉及 ansible-runner 执行通道的复用，不需要修改 spec
- `node-management`: edge.env 编辑入口在集群详情页的导航中，不修改现有节点管理

## Impact

- **后端新增**: `backend/app/api/v1/cluster_edge_env.py` — edge.env CRUD + 部署 API
- **后端修改**: `backend/app/main.py` — 注册新路由；`backend/app/models/cluster.py` — 新增 `EdgeEnvVersion` 模型
- **后端新增**: `backend/app/schemas/edge_env.py` — edge.env 相关 Pydantic schema
- **后端新增**: Ansible playbook 或脚本用于远程 edge.env 分发（`backend/ansible/`）
- **前端新增**: `frontend/src/views/clusters/ClusterEdgeEnv.vue` — 配置编辑页面
- **前端新增**: `frontend/src/api/edgeEnv.ts` — 前端 API 客户端
- **前端修改**: `frontend/src/router/index.ts` — 新增 edge.env 路由
- **前端修改**: 集群详情侧边栏 — 新增「edge.env」导航项
- **新增依赖**: 可能需要在 `pyproject.toml` 中添加 `ansible-runner`
