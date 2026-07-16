## Why

节点管理中"安装 OpenResty"功能的 Ansible 脚本硬编码了安装包文件名 `openresty-edge-26071308.tar.gz`，用户无法选择其他版本安装。`backend/ansible/soft/` 目录下已有多个版本的 openresty 包，用户需要能自行选择版本进行安装。

## What Changes

1. **Ansible 脚本参数化** — `install_openresty.yml` 将硬编码的文件名改为 `{{ openresty_file }}` 变量
2. **后端新增文件列表 API** — `GET /api/v1/clusters/{cluster_id}/nodes/openresty-files` 返回 `soft/` 目录下所有 `openresty-*.tar.gz` 文件（含文件名、大小、修改时间）
3. **后端接受文件选择** — `InstallOpenrestyRequest` 新增 `openresty_file` 必填字段，`srcpath` 和 `destpath` 改为由后端自动计算，前端不再传入
4. **前端选择对话框** — 点击"安装 OpenResty"后弹出对话框，列表展示可选安装包文件信息，用户选择后开始安装
5. **前端两处统一** — NodeList.vue 和 ClusterNodes.vue 的安装流程统一复用同一选择对话框逻辑

## Capabilities

### New Capabilities
- `openresty-version-selector`: 安装 OpenResty 前展示可选包列表供用户选择版本
- `openresty-soft-file-api`: 后端提供 `soft/` 目录文件列表 API

### Modified Capabilities
- `edge-node-lifecycle`: 安装 OpenResty 流程从"固定包 → 确认安装"变为"列可选包 → 用户选择 → 传入变量 → 安装"

## Impact

- `backend/ansible/roles/edge/tasks/install_openresty.yml` — 文件名变量化
- `backend/app/api/v1/cluster_install.py` — `InstallOpenrestyRequest` 新增字段 + 新增文件列表路由
- `backend/app/services/ansible_service.py` — `install_openresty()` 新增 `openresty_file` 参数
- `frontend/src/views/NodeList.vue` — "安装 OpenResty" 逻辑改为弹出文件选择对话框
- `frontend/src/views/clusters/ClusterNodes.vue` — 同上，统一复用
- 无 API 结构变更（仅新增路由 + 字段扩展）
- 无数据库模式变更
