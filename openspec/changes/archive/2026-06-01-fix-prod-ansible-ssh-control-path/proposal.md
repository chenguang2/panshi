## Why

生产环境部署后，Edge 节点操作（启动、停止、状态查询等）全部失败：
1. `ansible.utils.index_of` lookup 插件报 `No module named 'ansible_collections.ansible.utils'` — collection 未安装
2. SSH ControlPath 默认使用 `~/.ansible/cp/`，该目录在目标机器上不存在，导致 SSH 连接失败
3. SSH ControlPath 的 `%` 变量在 `ansible.cfg` 和 `ansible_service.py` 中未正确转义，导致 Python `%` 格式化报错
4. SSH socket 路径超 Unix domain socket 108 字符上限

## What Changes

- **backend/ansible/collections/requirements.yml** 新增 `ansible.utils` collection 声明
- **product/linux/gen-linux.sh** 新增 `ansible-galaxy collection install` 步骤
- **backend/ansible/ansible.cfg** 移除 SSH ControlPath 从 `ssh_args`，改用原生 `control_path` 配置项，指向 `/tmp/panshi-cp`
- **backend/app/services/ansible_service.py** 设置 `ANSIBLE_SSH_CONTROL_PATH` 环境变量到 `/tmp/panshi-cp`
- **product/linux/start.sh** 启动时创建 `/tmp/panshi-cp` 目录

## Capabilities

### New Capabilities

（无新增 capability，仅部署基础设施修复）

### Modified Capabilities

（无 spec 级行为变更）

## Impact

- `backend/ansible/ansible.cfg` — SSH ControlPath 配置
- `backend/app/services/ansible_service.py` — ansible-runner 环境变量
- `backend/ansible/collections/requirements.yml` — 新建 collection 依赖声明
- `product/linux/gen-linux.sh` — 构建脚本新增 collection 安装步骤
- `product/linux/start.sh` — 启动脚本新增目录创建
