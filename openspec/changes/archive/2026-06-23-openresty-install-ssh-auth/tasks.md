## 1. 后端 — 密码解析函数

- [x] 1.1 在 `ansible_service.py` 新增 `get_ssh_password(ip)` 函数，从 inventory/host 解析 `ansible_ssh_pass`（优先 host 级，回退 group vars，没有则返回 None）

## 2. 后端 — SSH 密码回退逻辑

- [x] 2.1 修改 `cluster_install.py` 中 `_install_openresty_stream()` 的 SSH 子进程构建逻辑：先尝试免密，失败（rc=255 或输出含 Permission denied）后用 `sshpass -p <password> ssh` 重试
- [x] 2.2 切换时向 SSE 流发送事件："免密登录失败，正在尝试密码认证..."
- [x] 2.3 两轮都失败时合并两轮错误输出上报（`_run_ssh_with_fallback` 中合并 stderr）
- [x] 2.4 修改 `cluster_install.py` 中 `_ssh_run()` 的 SSH 调用逻辑：同样增加 sshpass 重试
- [x] 2.5 提取 SSH + sshpass 命令构建逻辑为可复用的工具函数（`_build_ssh_cmd`, `_sshpass_available`, `_run_subprocess`, `_run_ssh_with_fallback` 在 `ansible_service.py`）

## 3. 后端 — 前置检查

- [x] 3.1 `_run_ssh_with_fallback` 中通过 `_sshpass_available()` 检查，不存在则跳过密码回退

## 4. 验证

- [ ] 4.1 验证免密节点安装正常（回归）
- [ ] 4.2 验证密码认证节点安装正常
- [ ] 4.3 验证 sshpass 未安装时前置检查生效
- [ ] 4.4 确认后端服务启动正常
