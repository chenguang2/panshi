## Context

Edge 节点默认不自动启动。已有单机 systemd 手动方案（`docs/help/edge-auto-start.md`），需做成平台功能统一管理多节点自启动。

**关键约束**（已真机验证 192.168.0.24）：
- 写 `/etc/systemd/system/` 与 `systemctl enable/disable` **必须 root**；节点用户（rocksware）不在 sudoers，`sudo`/`systemctl enable` 均被拒。
- 节点允许 root 直接 SSH（`PermitRootLogin yes`），root 密码可直连。
- `systemctl is-enabled` 可用普通用户读取（**查询状态不需 root**）。
- 现有 ansible inventory 用非 root 用户（rocksware/jboss），且无 become 提权；现有 `_inventory_inject_port` 提供"临时改 inventory、运行后恢复"的注入模式可复用。

## Goals / Non-Goals

**Goals:**
- 平台统一管理多节点自启动：启用/禁用/查询状态。
- 新增专用 ansible tag `edge_autostart`（模块化，符合现有 `install_edge` 模式）。
- 启用/禁用通过 root SSH（前端高级参数提供 root 账号密码，A1：仅本次执行用、不落库）。
- 查询状态复用非 root 连接，无需 root 密码。
- 独立页面（与工具箱平行菜单）。

**Non-Goals:**
- 不引入数据库落库 root 密码（A2 明确排除）。
- 不改为 become 提权方式（用户不在 sudoers，已否决 B）。
- 不覆盖"安装 Edge/OpenResty"等既有功能。

## Decisions

### 决策 1：ansible 新增专用 tag `edge_autostart`

在 `roles/edge/tasks/edge_autostart.yml` 定义，通过 extravars 参数 `action`（enable|disable|status）、`edge_service_content`、`restart` 控制行为；加入 `ALLOWED_TAGS`。

**实现要点**：
- `status`：用 `command: systemctl is-enabled edge`，返回 enabled/disabled（可读，不强制 root）。
- `enable`：`copy` 写 `/etc/systemd/system/edge.service` + `command: systemctl daemon-reload` + `command: systemctl enable edge`。
- `disable`：`command: systemctl disable edge`（可选删服务文件）。

**理由**：模块化、结构化输出、可复用；不被 `cmd_exec` 安全策略拦截；符合现有 `install_edge`/`install_openresty` 的任务形态。
**替代（放弃）**：复用 `cmd_exec_run` 跑 shell——命令分散、无结构化输出、安全策略拦截 `systemctl`/写文件，不适用。

### 决策 2：root 凭据通过 inventory 临时注入（复用 `_inventory_inject_port` 模式）

新增 `_inventory_inject_ssh(ip, user, password)` / `_inventory_restore_ssh(ip)`，在启用/禁用前把 `ansible_ssh_user=root` + `ansible_ssh_pass=<密码>` 临时写入 inventory 对应 host，运行后恢复原值。

**理由**：复用现有注入模式，不污染 ops 维护的 inventory，不落库；`run_playbook` 已从 inventory 读取凭据，无需改动 ansible 连接核心。

**安全**：
- 密码仅存在于本次请求的局部变量与临时 inventory 文件中，请求结束/运行后即恢复，不写入数据库、不写日志（`_sanitize_for_log` 已对密码做脱敏，需确认覆盖 `ansible_ssh_pass`）。
- **A1 确认**：前端每次启用/禁用都要填 root 密码，仅本次请求使用。

### 决策 3：查询状态不需 root

`status` 动作复用现有 inventory 的普通用户连接（`systemctl is-enabled` 可读），因此**查询状态不要求 root 密码**，前端查询按钮不展示/不强填 root 凭据。

**理由**：实测 `rocksware` 能执行 `systemctl is-enabled`。

### 决策 4：后端 API 复用现有 SSE 流式基础设施

新增 `backend/app/api/v1/edge_autostart.py`：
- `POST /nodes/{node_id}/autostart`，body `{action, edge_path?, run_user?, restart?, root_user?, root_password?}`。
- 复用 `_verify_node`（节点存在校验）、`AnsibleRunnerService.edge_autostart()`、`_run_ansible_stream`（SSE 进度流）。
- 返回流式进度 + 最终 rc/status（与 `install_openresty_stream` 一致）。

**理由**：与现有节点操作 API 风格统一，前端可复用执行结果抽屉。

### 决策 5：前端独立页面 + 高级参数

新增页面（路由与工具箱平行的菜单"自启动管理"）：
- 列出集群/节点，每节点"启用/禁用/查询状态"按钮。
- 启用/禁用时展开高级参数：Edge 目录（默认 `node.edge_path`）、运行用户（默认 `rocksware` 或探测）、崩溃自动重启（Restart=on-failure，可选）、**root 账号（默认 root）+ root 密码（必填）**。
- 查询状态：仅按钮，无 root 凭据。
- 展示查询结果（enabled/disabled）徽标。

**理由**：默认从节点数据推断（Node.edge_path 等），用户只在需要时覆盖；root 密码仅启用/禁用场景必填。

## Risks / Trade-offs

- [root 密码出现在临时 inventory / 日志] → 复用 `_sanitize_for_log` 脱敏 + 运行后立即恢复 inventory；明确不写日志明文。
- [每节点 root 密码不同，需每节点填] → 属预期（A1），前端按节点独立填写。
- [节点禁用 root SSH 的部署] → 该节点无法用方式 A，需运维预配（文档提示，或将来支持 C 方式）。
- [service 文件内容随 Edge 目录/用户变化] → 从节点数据 + 高级参数生成 `edge_service_content`，模板化。

## Migration Plan

1. ansible：新增 `edge_autostart.yml` + `ALLOWED_TAGS` + `_inventory_inject_ssh` 辅助。
2. 后端：`edge_autostart()` 方法 + `edge_autostart.py` API。
3. 前端：独立页面 + 路由 + API 调用 + 高级参数表单。
4. 文档：更新 `docs/help/edge-auto-start.md` 提及平台功能，或新增页面说明。
5. 无数据迁移（不落库 root 密码）。

## Open Questions

- 查询状态是否需要持久化展示（如节点列表存 last_autostart 状态）？默认不持久化，查询时实时返回。
- 是否支持"批量"（多节点一次性启用）？默认单节点操作，批量留待后续。
