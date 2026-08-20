## 1. ansible：新增 edge_autostart tag

- [x] 1.1 新增 `backend/ansible/roles/edge/tasks/edge_autostart.yml`，定义 `status` 任务（`systemctl is-enabled`，`when: action == 'status'`，`failed_when: false`）
- [x] 1.2 同文件定义 `enable` 任务（`copy` 写 `/etc/systemd/system/edge.service` + `daemon-reload` + `systemctl enable edge`，均 `when: action == 'enable'`）
- [x] 1.3 同文件定义 `disable` 任务（`systemctl disable edge`，`when: action == 'disable'`；**保留** `/etc/systemd/system/edge.service` 文件，仅取消自启，不删除文件）
- [x] 1.4 每个任务均加 `when: action == ...` 条件隔离，确保 status 时不误触发 enable/disable 的写文件与 systemctl 操作
- [x] 1.5 将 `edge_autostart` 加入 `backend/app/services/ansible_service.py` 的 `ALLOWED_TAGS`
- [x] 1.6 后端按决策 1a 模板生成 `edge_service_content`（run_user/edge_path 插值，**不含 Restart**），作为 `copy` 的内容
- [x] 1.7 `status` 任务按输出归一化三态：enabled / disabled / not_configured（含 `No such file or directory`）/ unknown

## 2. ansible/后端：root 凭据注入与恢复

- [x] 2.1 新增 `_inventory_inject_ssh(ip, user, password)` 辅助（复用 `_inventory_inject_port` 模式，临时写 `ansible_ssh_user`/`ansible_ssh_pass`）
- [x] 2.2 新增 `_inventory_restore_ssh(ip)` 辅助（运行后恢复原始凭据）
- [x] 2.3 确认 `_sanitize_for_log` 对 `ansible_ssh_pass` 脱敏，日志不输出密码明文

## 3. 后端：edge_autostart 方法与 API

- [x] 3.1 `AnsibleRunnerService.edge_autostart(ip, action, edge_service_content, ssh_user, ssh_pass)` 方法，注入 root 凭据后 `run_playbook`（不含 restart 参数）
- [x] 3.2 新增 `backend/app/api/v1/edge_autostart.py`：`POST /nodes/{node_id}/autostart`（action + 可选参数 + root 凭据）
- [x] 3.3 复用 `_verify_node` 校验节点、`_run_ansible_stream` 输出 SSE 进度
- [x] 3.4 查询状态（status）走非 root 连接，不要求 root 凭据
- [x] 3.5 在 `app/main.py` / api_router 注册新路由
- [x] 3.6 前置校验：节点 ip 是否在 ansible inventory 的 edge_cluster 下，不在则返回 400
- [x] 3.7 明确失败提示：root 认证失败 / SSH 连接失败 / 重复启用覆盖提示
- [x] 3.8 运行用户默认值 = `getpass.getuser()`（运行当前后台程序的用户），前端可覆盖

## 4. 前端：自启动管理页面

- [ ] 4.1 新增页面组件（列出集群/节点 + 启用/禁用/查询按钮）
- [ ] 4.2 高级参数区：Edge 目录、运行用户（默认 = 运行后台程序的用户，可覆盖，提示"请确认节点 Edge 实际运行用户"）、root 账号/密码输入框（仅启用/禁用展示；不含"崩溃自动重启"选项）
- [ ] 4.3 查询状态结果展示三态徽标（enabled / disabled / not_configured），not_configured 提示"该节点未配置自启动服务"
- [ ] 4.4 新增 API 调用（`frontend/src/api/edgeAutostart.ts`）与路由注册（与工具箱平行菜单）

## 5. 测试与验证

- [x] 5.1 后端单测：`ALLOWED_TAGS` 含 `edge_autostart`
- [x] 5.2 后端单测：`_inventory_inject_ssh`/`_inventory_restore_ssh` 正确注入/恢复
- [x] 5.3 后端单测：`edge_autostart` 方法构造正确 extravars/凭据
- [x] 5.4 后端 API 单测：`POST /nodes/{id}/autostart` 各 action 的路由与校验
- [ ] 5.5 真机验证：对 192.168.0.24 执行 enable/disable/status 全流程
- [x] 5.6 运行后端完整测试套件确认无回归
- [ ] 5.7 前端类型检查与相关单测
- [ ] 5.8 文档更新：`docs/help/edge-auto-start.md` 提及平台功能
