## Why

当目标节点的 SSH 端口不是标准 22（如 1122）时，远程安装 OpenResty、执行节点任务等**所有依赖 SSH 的操作都会连接 22 端口失败**。经代码查询确认根因：

1. **直连 SSH 路径**：`ansible_service.py` 的 `_build_ssh_cmd` 构造的 ssh 命令**没有 `-p <port>` 参数**（`f"{ssh_user}@{ip}"` 直连，默认 22 端口），免密（key）与密码两种模式均受影响
2. **Ansible 路径**：`ansible/inventory/host` 中所有主机**没有 `ansible_port`/`ansible_ssh_port` 字段**，ansible 默认 22 端口
3. **无端口配置入口**：`Node` ORM 模型没有 SSH 端口字段，前端节点表单无法配置

受影响的功能：安装 OpenResty（`_install_openresty_stream` 免密/密码两轮）、取消安装（`_ssh_run`）、软件查询（`node_task_service`）、命令执行（`node_task_service`）等全部 SSH 调用点。

## What Changes

- **Node 模型加 `ssh_port` 字段**（默认 22，可空则沿用默认）：`backend/app/models/cluster.py`
- **前端节点表单/列表加 SSH 端口配置**：`useClusterNodes.ts`、节点编辑弹窗（默认 22）
- **`_build_ssh_cmd` 支持端口**：新增 `port` 参数，非 22 时注入 `-p <port>`；`_run_ssh_with_fallback` 透传；`_ssh_run` 改签名加 port（评审确认）
- **`get_ssh_user`/`get_ssh_password` 同款新增 `get_ssh_port(ip)`**：从 inventory 读取 `ansible_port`（优先 host 级 → group vars → 默认 22），不缓存
- **调用点统一透传**：`resolve_ssh_port(node)`（Node 模型 → inventory → 22）供 cluster_install.py（安装/取消）、node_task_service.py（软件查询/命令执行）使用
- **Ansible 路径动态注入 inventory（评审确认）**：`run_playbook` 加可选 `ssh_port` 参数，执行前临时更新该主机 `ansible_port`（文件锁 + 每次重读），执行后恢复原值；失败记录日志不阻断
- **向后兼容**：未配置端口（None/22）时行为与现状完全一致（直连不注入 `-p`、ansible 不改 inventory）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-management`: 节点支持自定义 SSH 端口配置，所有远程 SSH 操作（安装 OpenResty、软件查询、命令执行等）使用该端口。

## Impact

- `backend/app/models/cluster.py`：Node 加 `ssh_port` 列
- `backend/app/schemas/`：Node schema 加 `ssh_port`
- `backend/app/api/v1/cluster_nodes.py`：节点创建/更新支持 `ssh_port`
- `backend/app/services/ansible_service.py`：`_build_ssh_cmd`/`_run_ssh_with_fallback`/`_ssh_run` 加 port 参数，新增 `get_ssh_port`、`resolve_ssh_port`，`run_playbook` 加 `ssh_port` 参数 + inventory 动态注入
- `backend/app/api/v1/cluster_install.py`：安装/取消安装透传端口
- `backend/app/services/node_task_service.py`：软件查询/命令执行透传端口
- `frontend/src/composables/useClusterNodes.ts` + 节点表单/列表：SSH 端口配置
- DB 迁移：`ps_node` 加 `ssh_port` 列（可空，默认 22）
- 测试：新增端口注入/透传/默认值测试
