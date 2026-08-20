## Why

Edge 网关节点（部署 `uap-edge` + `openresty`）默认**不会开机自启**，机器重启后需人工执行 `bin/edge start`。目前已有单机 systemd 手动配置方案（`docs/help/edge-auto-start.md`），但多节点需逐个手工 SSH 配置，效率低且易遗漏。需要将"自启动配置"做成平台功能，通过管理端统一启用/禁用/查询多个节点的自启动。

写 systemd 服务 + `systemctl enable` 需要 **root 权限**；实测节点用户（如 rocksware）不在 sudoers，但节点允许 root 直接 SSH（`PermitRootLogin yes`），因此采用前端提供 root 账号密码（仅本次执行，不落库）直连的方式。

## What Changes

- 新增独立页面"自启动管理"（与工具箱平行的菜单），列出集群/节点。
- 每个节点支持三个操作：**启用自启动**、**禁用自启动**、**查询状态**（当前是否已 enable）。
- 后端新增专用 ansible tag `edge_autostart`（enable/disable/status），通过新增 API 端点触发，复用现有 SSE 进度流与执行结果展示。
- 高级参数区可选：Edge 目录、运行用户、崩溃自动重启（Restart=on-failure）；默认自动从节点数据推断。
- 启用/禁用需 root：前端高级参数提供 root 账号密码输入框，**仅本次请求内使用、不落库**（A1）。查询状态复用现有非 root 连接（`systemctl is-enabled` 可读）。

## Capabilities

### New Capabilities
- `edge-node-autostart`: 管理 Edge 节点开机自启动（启用/禁用/查询状态）的独立页面与后端下发能力。

### Modified Capabilities
<!-- 无现有 spec 需求变化；这是全新能力 -->

## Impact

- **后端 ansible**：`backend/ansible/roles/edge/tasks/edge_autostart.yml`（新增任务）；`backend/app/services/ansible_service.py` 的 `ALLOWED_TAGS` 加入 `edge_autostart`，新增 `edge_autostart()` 方法。
- **后端 API**：新增路由（如 `backend/app/api/v1/edge_autostart.py`），`POST /nodes/{node_id}/autostart`（body: action + 可选参数 + root 凭据），复用 `_run_ansible_stream`/`_verify_node`；查询状态端点。
- **后端凭据处理**：root 账号密码仅本次请求内用于 ansible 连接（`ansible_ssh_user=root` + `ansible_ssh_pass`），不写入数据库/日志。
- **前端**：新增独立页面（与工具箱平行菜单），节点列表 + 启用/禁用/查询按钮 + 高级参数区（Edge 目录/运行用户/Restart/root 账号密码）。
- **文档**：更新 `docs/help/edge-auto-start.md` 或新增平台功能说明。
