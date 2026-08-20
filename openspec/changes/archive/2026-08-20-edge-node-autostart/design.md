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

在 `roles/edge/tasks/edge_autostart.yml` 定义，通过 extravars 参数 `action`（enable|disable|status）与 `edge_service_content` 控制行为；加入 `ALLOWED_TAGS`。

**实现要点**：
- 同一 `edge_autostart` tag，但**每个任务用 `when: action == '...'` 条件严格隔离**，避免查询状态时误执行 enable/disable 的写文件与 systemctl 操作（尤其查询状态走非 root 连接，若误触发 `copy` 写 `/etc/systemd/system/` 会 Permission denied 甚至误改系统）。
- `status`：`command: systemctl is-enabled edge`，`when: action == 'status'`（可读，不强制 root）。
- `enable`：`copy` 写 `/etc/systemd/system/edge.service` + `command: systemctl daemon-reload` + `command: systemctl enable edge`，均 `when: action == 'enable'`。
- `disable`：`command: systemctl disable edge`，`when: action == 'disable'`（是否删服务文件见决策 6）。

**理由**：模块化、结构化输出、可复用；不被 `cmd_exec` 安全策略拦截；符合现有 `install_edge`/`install_openresty` 的任务形态。`when` 条件隔离是功能正确性的硬性要求（否则 status 会误触发 enable 的 root 写操作）。
**替代（放弃）**：复用 `cmd_exec_run` 跑 shell——命令分散、无结构化输出、安全策略拦截 `systemctl`/写文件，不适用。拆成三个独立 tag（`edge_autostart_enable`/`_disable`/`_status`）也可行，但单 tag + `when` 更简洁、共享同一 tag 便于白名单管理。

### 决策 1a：edge.service 文件内容模板

`enable` 动作通过 `copy` 写入的 `/etc/systemd/system/edge.service` 内容，由后端按以下模板生成（`edge_service_content`），字段来源为节点数据 + 高级参数：

```ini
[Unit]
Description=Edge Gateway
After=network.target

[Service]
Type=oneshot
User={{ run_user }}
Group={{ run_user }}
WorkingDirectory={{ edge_path }}
ExecStart={{ edge_path }}/bin/edge start
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

字段说明：
- `{{ run_user }}`：运行用户，默认从节点推断（见决策 7），高级参数可覆盖。
- `{{ edge_path }}`：Edge 目录，默认 `node.edge_path`，高级参数可覆盖。

**不提供 `Restart` 崩溃自动重启**：由于 `Type=oneshot` + `bin/edge start` daemon 化，systemd 的 `Restart` 检测的是 start 命令进程而非 nginx 本身，对 nginx 崩溃感知有限、实际几乎不生效；为避免误导（YAGNI），本变更不提供该选项（见决策 6a）。

**理由**：模板化使 service 内容可随节点数据/参数变化，且与已真机验证的 `docs/help/edge-auto-start.md` 方案（Type=oneshot + RemainAfterExit=yes + User=rocksware + bin/edge start）一致。

### 决策 6a：不提供"崩溃自动重启"选项

**明确移除**高级参数中的"崩溃自动重启（Restart=on-failure）"选项。

**理由**：
- 本架构为 `Type=oneshot` + `RemainAfterExit=yes`，`ExecStart=bin/edge start` 启动 nginx 后立即退出（daemon 化）。
- systemd 的 `Restart=on-failure` 检测的是 **ExecStart 命令进程**的退出状态，而非 nginx 进程本身；`bin/edge start` 正常返回（退出码 0），故 `Restart` 几乎不触发，对 nginx 崩溃无实际守护效果。
- 提供该选项会让用户误以为"崩溃会自动重启"，实际不生效，构成误导。
- 真正守护 nginx 需 `Type=simple` + nginx `daemon off`（较大改动，与现有方案不兼容），不在本变更范围。

**非目标**：不实现真正意义的 nginx 崩溃守护（如确需，作为独立后续变更）。

### 决策 7：运行用户默认值 = 运行当前后台程序的用户

service 文件模板中的 `User={{ run_user }}`/`Group={{ run_user }}`，其默认值 = **运行当前磐石 Admin 后台程序（后端）的 Linux 用户**，而非节点 inventory 的 SSH 用户。

**实现**：后端用 `getpass.getuser()`（或 `os.getenv("USER")`）获取当前进程运行用户，作为默认 `run_user`；前端高级参数展示该默认值，用户可在运行用户特殊时覆盖。

**理由**（经讨论确认）：
- "运行当前程序的用户"是最合理的默认——部署磐石 Admin 的运维通常也用同一用户/权限体系管理节点服务。
- 与节点 inventory 的 SSH 用户（rocksware/jboss）解耦，避免错误地用节点连接用户作为节点服务运行用户。
- 每台节点通常以同一用户运行（与部署者一致），默认值基本正确；特殊时前端可覆盖。

> 注意：`run_user` 默认值是"部署磐石 Admin 的用户"，**不一定等于**目标节点上 Edge 实际运行用户。若节点 Edge 运行用户与默认不同（如平台跑在 qcg、节点 Edge 跑在 rocksware），用户必须在高级参数中改为节点实际运行用户，否则 service 文件 User= 错误会导致 nginx 起不来。前端应在高级参数区提示"请确认节点 Edge 的实际运行用户"。

### 决策 2：root 凭据通过 inventory 临时注入（复用 `_inventory_inject_port` 模式）

新增 `_inventory_inject_ssh(ip, user, password)` / `_inventory_restore_ssh(ip)`，在启用/禁用前把 `ansible_ssh_user=root` + `ansible_ssh_pass=<密码>` 临时写入 inventory 对应 host，运行后恢复原值。

**理由**：复用现有注入模式，不污染 ops 维护的 inventory，不落库；`run_playbook` 已从 inventory 读取凭据，无需改动 ansible 连接核心。

**安全**：
- 密码仅存在于本次请求的局部变量与临时 inventory 文件中，请求结束/运行后即恢复，不写入数据库、不写日志（`_sanitize_for_log` 已对密码做脱敏，需确认覆盖 `ansible_ssh_pass`）。
- **A1 确认**：前端每次启用/禁用都要填 root 密码，仅本次请求使用。

### 决策 3：查询状态不需 root

`status` 动作复用现有 inventory 的普通用户连接（`systemctl is-enabled` 可读），因此**查询状态不要求 root 密码**，前端查询按钮不展示/不强填 root 凭据。

**三态归一化**：`systemctl is-enabled` 对三种情况输出不同（已真机验证 192.168.0.24）：

| 情况 | stdout | 退出码 |
|---|---|---|
| enabled（已启用自启） | `enabled` | 0 |
| disabled（有 service 文件但未启用） | `disabled` | 1 |
| 未配置（无 service 文件） | `Failed to get unit file state for ...: No such file or directory` | 1 |

`status` 任务设置 `failed_when: false`，按输出内容归一化为三态：
- stdout 含 `enabled` → **enabled**
- stdout 含 `disabled` → **disabled**（有文件未启用）
- 含 `No such file or directory` → **not_configured**（未配置/无文件，前端明确提示"该节点未配置自启动服务"）
- 其他 → **unknown**

**理由**：disabled 与"无文件"退出码均为 1，须靠输出内容区分，否则"未配置"会被误判为 disabled 或失败；三态明确区分便于前端提示用户"先启用自启动"。

### 决策 4：后端 API 复用现有 SSE 流式基础设施

新增 `backend/app/api/v1/edge_autostart.py`：
- `POST /nodes/{node_id}/autostart`，body `{action, edge_path?, run_user?, root_user?, root_password?}`。
- 复用 `_verify_node`（节点存在校验）、`AnsibleRunnerService.edge_autostart()`、`_run_ansible_stream`（SSE 进度流）。
- 返回流式进度 + 最终 rc/status（与 `install_openresty_stream` 一致）。

**理由**：与现有节点操作 API 风格统一，前端可复用执行结果抽屉。

### 决策 4a：失败场景与错误处理

自启动操作涉及远程 ansible，需明确失败场景的前置校验与提示：

- **节点不在 inventory**：执行前**前置校验**节点 ip 是否存在于 `backend/ansible/inventory/` 的 `edge_cluster` 下；不在则直接返回 400（"节点未在 ansible inventory 中，无法下发"）。理由：root 凭据注入依赖 inventory 中已有该 host（`_inventory_inject_ssh` 对不存在的 host 注入无效），且现有节点操作同样依赖 inventory。
- **root 密码错误 / SSH 认证失败**：ansible 返回 rc≠0 / status=failed，SSE 流展示连接错误，前端提示"root 认证失败，请检查 root 账号密码"。
- **SSH 连接超时/节点不可达**：`run_playbook` 超时或连接失败，SSE 流展示错误，前端提示"连接节点失败"。
- **重复启用**：`copy` 覆盖已有 service 文件（属预期，前端在启用前提示"将覆盖节点上已有的 edge.service"）。

**理由**：`run_playbook`/`_run_ansible_stream` 已能返回连接/执行失败（rc/status），前端 SSE 可展示；本决策补充**前置校验（inventory 存在性）**与**明确错误提示文案**，避免"注入无效却静默失败"的隐蔽问题。

### 决策 5：前端独立页面 + 高级参数

新增页面（路由与工具箱平行的菜单"自启动管理"）：
- 列出集群/节点，每节点"启用/禁用/查询状态"按钮。
- 启用/禁用时展开高级参数：Edge 目录（默认 `node.edge_path`）、运行用户（默认 = 运行当前后台程序的用户，见决策 7；可覆盖）、**root 账号（默认 root）+ root 密码（必填）**。（不含"崩溃自动重启"选项，见决策 6a。）
- 查询状态：仅按钮，无 root 凭据；展示三态结果徽标（enabled / disabled / not_configured）。
- 查询为 not_configured 时提示"该节点未配置自启动服务"。

**理由**：默认从节点数据推断（Node.edge_path 等），用户只在需要时覆盖；root 密码仅启用/禁用场景必填。

### 决策 6：禁用时保留 service 文件（仅取消自启）

`disable` 动作**只执行 `systemctl disable edge`**（移除 `multi-user.target.wants` 自启链接），**不删除** `/etc/systemd/system/edge.service` 文件。

**理由**：
- `systemctl disable` 的标准语义就是"取消开机自启"，不删文件。
- 不破坏可能存在的用户自定义 service 文件（例如节点已按 `docs/help/edge-auto-start.md` 手动配置过 `edge.service`）。
- 保留文件后用户仍可 `systemctl start edge` 手动启动；重复启用时 `copy` 覆盖（用户自定义会被覆盖，属预期，文档提示）。
- 实现简单，无需额外的 `file` 删除任务。

**非目标**：不提供"彻底删除 service 文件"的能力（如确需，后续可作为独立小功能或由运维在节点上处理）。

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
