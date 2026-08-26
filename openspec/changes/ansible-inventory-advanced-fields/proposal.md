## Why

Ansible 主机清单界面（表格视图）目前只能编辑 IP 与 SSH 凭据两个字段；`ansible_port`、`ansible_connection`、提权系列、私钥路径等常用连接变量虽在保存时全保真保留，但修改必须切到源码模式手写 YAML，对非 ansible 专家不友好。将高频键升级为表格一等公民后，源码模式降级为纯兜底，符合工具箱页面定位。

## What Changes

- 后端：已知键清单从 `_CRED_KEYS`（2 个）扩展为 `KNOWN_HOST_KEYS`（11 个常用连接变量）；不在清单内的键仍走 unknown_keys 保真提示
- 前端表格视图：每行新增"高级设置"展开区，编辑以下字段——
  - `ansible_port`（数字 1-65535 校验）
  - `ansible_host`（别名映射）
  - `ansible_connection`（下拉：smart/ssh/paramiko_ssh/local/docker/podman）
  - `ansible_python_interpreter`、`ansible_ssh_private_key_file`、`ansible_ssh_common_args`（文本）
  - `ansible_become` / `ansible_become_user` / `ansible_become_pass`（开关 + 文本）
- 全保真机制不变：未编辑的未知键照旧保留；parse/render 无需改动

## Capabilities

### New Capabilities
<!-- 无 -->

### Modified Capabilities
- `ansible-inventory-management`: 表格视图编辑范围从 2 个凭据字段扩展到 11 个常用连接变量；unknown_keys 判定随之收窄
