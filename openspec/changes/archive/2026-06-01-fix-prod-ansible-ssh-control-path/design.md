## Context

生产环境（`product/linux/panshi/`）部署后，Edge 节点操作（nginx 启停、状态查询）全部失败。排查发现三个独立问题链：

1. **Collection 缺失**：Ansible playbook 使用 `ansible.utils.index_of` lookup，但 `ansible.utils` collection 在生产环境未安装
2. **SSH ControlPath 目录不存在**：`ansible.cfg` 中 `ssh_args` 使用 `-o ControlPath=~/.ansible/cp/%h-%p-%r`，但生产环境的 `~/.ansible/cp/` 目录不存在
3. **SSH socket 路径超长**：Unix domain socket 路径限制 108 字符，部署路径深度 + socket 文件名（含随机后缀）超出限制

涉及文件：
- `backend/ansible/ansible.cfg`
- `backend/app/services/ansible_service.py`
- `backend/ansible/collections/requirements.yml`（新建）
- `product/linux/gen-linux.sh`
- `product/linux/start.sh`

## Goals / Non-Goals

**Goals:**
- Edge 节点操作在生产环境正常运行
- SSH ControlPath 不依赖 `~/.ansible/cp/`（可能会不存在）
- SSH socket 路径不超过 108 字符限制
- `ansible.utils.index_of` lookup 可用

**Non-Goals:**
- 不改动 Ansible playbook 逻辑（task 文件不变）
- 不改动 `ansible_service.py` 的业务逻辑

## Decisions

| 问题 | 方案 | 理由 |
|---|---|---|
| Collection 缺失 | 创建 `requirements.yml` + `gen-linux.sh` 中 `ansible-galaxy collection install` | 自动化构建时安装，不依赖目标机器手动操作 |
| ControlPath 目录 | 统一使用 `/tmp/panshi-cp/` | `/tmp` 路径短（14 字符），socket 路径 56 字符，远低于 108 限制 |
| `%` 转义 | `ansible.cfg` 用 `%%%%`，env var 用 `%%` | 需穿透 ConfigParser 的 `%%` → `%` 和 SSH 插件的 `% dict(directory=...)` 两层格式化 |
| `control_path` vs `ssh_args` | 使用 Ansible 原生 `control_path` 配置项 | 比在 `ssh_args` 中手写更清晰，Ansible 自动处理目录创建 |

## Risks / Trade-offs

- [清理] `/tmp/panshi-cp/` 下的 socket 文件不会自动清理，需注意磁盘空间。`ControlPersist=600s` 会在 10 分钟无活动后自动关闭连接并清理 socket
- [兼容性] 新生成的部署包才包含 collection 安装步骤，已有部署包需手动补装
