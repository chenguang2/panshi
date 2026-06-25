## Why

安装 OpenResty 的 SSH 远程执行阶段（第二阶段）目前只支持免密登录，硬编码 `-i ~/.ssh/id_rsa -o BatchMode=yes`。但部分目标节点尚未配置免密，inventory/host 文件中已维护了用户名和密码。需要支持密码认证回退，避免因免密不可用导致安装失败。

## What Changes

- `cluster_install.py` 中 SSH 命令构建逻辑：优先尝试免密，免密失败后使用 `sshpass` + 密码登录
- `ansible_service.py` 新增 `get_ssh_password()` 函数，从 inventory/host 解析密码
- `_ssh_run()` 辅助函数同样增加密码回退
- 涉及两个位置：`_install_openresty_stream()` 中的 SSH 子进程、`_ssh_run()` 工具函数

## Capabilities

### New Capabilities
- `ssh-password-fallback`: 后台 SSH 远程执行时支持密码认证回退

### Modified Capabilities
- （无 spec 级别行为变更，仅实现细节改动）

## Impact

- `backend/app/api/v1/cluster_install.py` — SSH 命令构建 + 密码回退
- `backend/app/services/ansible_service.py` — 新增 `get_ssh_password()` + 可能的 `_ssh_run` 调用打通
