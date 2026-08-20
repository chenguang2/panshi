## 1. ansible：新增 edge_autostart tag

- [ ] 1.1 新增 `backend/ansible/roles/edge/tasks/edge_autostart.yml`，定义 `status`（`systemctl is-enabled`）任务
- [ ] 1.2 同文件定义 `enable` 任务（`copy` 写 `/etc/systemd/system/edge.service` + `daemon-reload` + `systemctl enable edge`）
- [ ] 1.3 同文件定义 `disable` 任务（`systemctl disable edge`）
- [ ] 1.4 将 `edge_autostart` 加入 `backend/app/services/ansible_service.py` 的 `ALLOWED_TAGS`

## 2. ansible/后端：root 凭据注入与恢复

- [ ] 2.1 新增 `_inventory_inject_ssh(ip, user, password)` 辅助（复用 `_inventory_inject_port` 模式，临时写 `ansible_ssh_user`/`ansible_ssh_pass`）
- [ ] 2.2 新增 `_inventory_restore_ssh(ip)` 辅助（运行后恢复原始凭据）
- [ ] 2.3 确认 `_sanitize_for_log` 对 `ansible_ssh_pass` 脱敏，日志不输出密码明文

## 3. 后端：edge_autostart 方法与 API

- [ ] 3.1 `AnsibleRunnerService.edge_autostart(ip, action, edge_service_content, restart, ssh_user, ssh_pass)` 方法，注入 root 凭据后 `run_playbook`
- [ ] 3.2 新增 `backend/app/api/v1/edge_autostart.py`：`POST /nodes/{node_id}/autostart`（action + 可选参数 + root 凭据）
- [ ] 3.3 复用 `_verify_node` 校验节点、`_run_ansible_stream` 输出 SSE 进度
- [ ] 3.4 查询状态（status）走非 root 连接，不要求 root 凭据
- [ ] 3.5 在 `app/main.py` / api_router 注册新路由

## 4. 前端：自启动管理页面

- [ ] 4.1 新增页面组件（列出集群/节点 + 启用/禁用/查询按钮）
- [ ] 4.2 高级参数区：Edge 目录、运行用户、Restart 复选框、root 账号/密码输入框（仅启用/禁用展示）
- [ ] 4.3 查询状态结果展示（enabled/disabled 徽标）
- [ ] 4.4 新增 API 调用（`frontend/src/api/edgeAutostart.ts`）与路由注册（与工具箱平行菜单）

## 5. 测试与验证

- [ ] 5.1 后端单测：`ALLOWED_TAGS` 含 `edge_autostart`
- [ ] 5.2 后端单测：`_inventory_inject_ssh`/`_inventory_restore_ssh` 正确注入/恢复
- [ ] 5.3 后端单测：`edge_autostart` 方法构造正确 extravars/凭据
- [ ] 5.4 后端 API 单测：`POST /nodes/{id}/autostart` 各 action 的路由与校验
- [ ] 5.5 真机验证：对 192.168.0.24 执行 enable/disable/status 全流程
- [ ] 5.6 运行后端完整测试套件确认无回归
- [ ] 5.7 前端类型检查与相关单测
- [ ] 5.8 文档更新：`docs/help/edge-auto-start.md` 提及平台功能
