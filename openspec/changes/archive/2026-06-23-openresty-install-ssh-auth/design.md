## Context

安装 OpenResty 分两阶段：阶段 1 通过 Ansible 传输文件并解压，阶段 2 通过 SSH 在目标节点上执行 `install-edge.sh` 编译脚本。阶段 2 的 SSH 调用在 `cluster_install.py` 的 `_install_openresty_stream()` 和 `_ssh_run()` 中实现，目前硬编码 `-i ~/.ssh/id_rsa -o BatchMode=yes`，仅支持免密登录。

`backend/ansible/inventory/host` 文件中已经为每个 IP 维护了 `ansible_ssh_user` 和 `ansible_ssh_pass`，且已有 `get_ssh_user()` 函数从中解析用户名。密码字段目前只有 Ansible 本身在使用。

## Goals / Non-Goals

**Goals:**
- SSH 远程执行时优先尝试免密登录
- 免密不可用时（如返回码 255 / Permission denied），回退到用户名+密码认证
- 密码从 inventory/host 文件中读取，复用已有的 `ansible_ssh_pass` 字段
- 覆盖 `_install_openresty_stream()` 和 `_ssh_run()` 两个入口

**Non-Goals:**
- 不修改 Ansible 自身的认证方式（Ansible 已通过 host 文件支持密码）
- 不改动阶段 1 的 Ansible 流程
- 不新增前端 UI 输入密码的交互

## Decisions

### 1. 使用 sshpass 实现密码认证
`sshpass` 是一个轻量工具，通过 `SSHPASS` 环境变量或 `-p` 参数传递密码给 SSH。Ansible 部署环境已有 `sshpass`（参见 ansible README 中的安装步骤），无需额外依赖。

### 2. 回退策略：先免密，失败后用 sshpass
- 第一轮：用当前方式（`-o BatchMode=yes -i ~/.ssh/id_rsa`）执行 SSH
- 如果返回码非 0 且输出包含 "Permission denied" 或 "Authentication failed" 或返回码为 255，则第二轮用 `sshpass -p <password> ssh -o StrictHostKeyChecking=no ...`
- 两轮都失败才报错，合并两轮的错误输出一起上报
- 免密→密码切换时，向 SSE 流发送一条状态提示："免密登录失败，正在尝试密码认证..."
- `_ssh_run()` 和 `_install_openresty_stream()` 统一开启密码回退，不额外加参数控制

### 3. sshpass 前置检查
执行 sshpass 前先检查 `command -v sshpass`。如果 sshpass 不存在，跳过密码回退，直接报错："未安装 sshpass，且免密不可用"。

### 4. 密码传递方式
使用 `sshpass -p <password>` 参数传递密码，不使用 SSHPASS 环境变量。密码在进程命令行中可见的风险与 inventory/host 文件明文存储密码的风险一致。

### 5. 密码解析函数
在 `ansible_service.py` 中新增 `get_ssh_password(ip)`，与 `get_ssh_user(ip)` 同层解析 inventory/host 文件中的 `ansible_ssh_pass`。

### 6. 覆盖两个调用点
- `_install_openresty_stream()` 中的 `asyncio.create_subprocess_exec` 调用
- `_ssh_run()` 工具函数

## Risks / Trade-offs

- `sshpass` 在部分最小化系统上可能未安装 → 但 Ansible 部署环境已依赖它，风险低
- 密码以明文出现在进程参数中（`ps aux` 可见） → 与 inventory/host 文件本身明文存储密码的风险一致，当前部署环境可接受
