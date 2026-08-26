## Context

- Inventory 文件：`backend/ansible/inventory/host`（可用环境变量 `PANSHI_ANSIBLE_DIR` 覆盖目录），YAML 结构 `all.children.edge_cluster.hosts`，键为节点 IP，值可为 dict（含 `ansible_ssh_user`/`ansible_ssh_pass`）或 null（继承组级 `vars` 默认凭据）；文件中存在手工注释的备用凭据行。
- 运行时依赖（`app/services/ansible_service.py`）：每次操作实时读文件，无缓存——界面写回后天然立即生效；另有 `_inventory_inject_port/_inject_ssh/_restore_ssh` 会在任务执行期间临时改写文件，因此**写入必须原子替换**，避免 ansible 读到半截文件或覆盖注入状态。
- 可复用设施：前端 MonacoEditor 组件、插件编辑器"表单+JSON 双模式"交互约定、features.yaml 功能开关三件套接线（KNOWN_FEATURES / feature_routers 或菜单 feature 标记）。
- 评审核实：运行时注入受进程内 `_inventory_lock`（threading）保护，restore 幂等（只删等于注入值的字段）；注入写回用 `yaml.safe_dump` 整体重写——**注释在每次任务运行时本就会被抹掉**；inventory 文件已被 `backend/ansible/.gitignore` 忽略（密码未进 git）。

## Goals / Non-Goals

**Goals:**

- 界面查看与编辑 inventory：表格视图（日常）+ Monaco 源码视图（高级），共享同一草稿
- 保存三重护栏：解析校验 → 结构校验 → 自动备份 + 原子写回
- 密码明文展示（用户已确认），功能仅管理员可用
- features.yaml 开关 `ansible_inventory` 控制菜单与 API
- 与节点管理联动：识别 inventory 中未录入平台的 IP

**Non-Goals:**

- 不做密码加密存储/凭据轮换（保持 ansible 明文格式兼容）
- 不改动 `ansible_service.py` 的运行时注入/恢复逻辑
- 不支持多 inventory 文件或其他 group/child 结构编辑（仅 `edge_cluster.hosts` 与组级 `vars`）
- 不做并发编辑冲突检测（最后写入胜，见 Risks）

## Decisions

### D1. API 设计

- `GET /ansible/inventory` → `{ raw_text, hosts: [{ip, ansible_ssh_user, ansible_ssh_pass}], vars: {ansible_ssh_user, ansible_ssh_pass}, unknown_keys: [...], unmanaged_ips: [...] }`
  - `raw_text` 供源码视图初始化；`hosts/vars` 供表格视图初始化；`unknown_keys` 列出 hosts 条目上除两个凭据字段外的自定义键（提示这些内容只在源码模式下可维护）
  - `unmanaged_ips`：inventory 有而 `ps_node` 无记录的 IP（联动提示）
- `PUT /ansible/inventory` 接受二选一载荷：
  - `{ "raw_text": "..." }` —— 源码模式提交，原文保留注释，仅做校验
  - `{ "hosts": [...], "vars": {...} }` —— 表格模式提交，服务端渲染为 YAML（该路径不保留原文件注释）
- `POST /ansible/inventory/render`（hosts+vars → YAML 文本）与 `POST /ansible/inventory/parse`（raw_text → 结构化 + 错误列表）：供前端双模式切换时转换草稿，YAML 逻辑全部收敛在服务端，前端零 yaml 依赖。
- **并发互斥（评审确认）**：界面读/写全部复用 `_inventory_lock`；PUT 前检查是否存在运行中的节点任务或 playbook，存在则返回 **409** 提示稍后再试——防止把注入中的临时端口/凭据固化进文件。
- 全部接口仅管理员。

### D2. 校验规则（保存护栏）

1. `yaml.safe_load` 必须成功（源码模式；结构化路径由渲染保证）
2. 顶层含 `all.children.edge_cluster.hosts` 且为 dict；`vars` 为 dict 或缺失
3. host 键须为合法 IPv4/主机名；host 值须为 dict 或 null
4. **全保真（评审确认）**：parse 返回 host 条目的完整字段字典与完整 vars；render 原样回写全部键——表格编辑只改动凭据字段，未知自定义键永不静默丢弃
5. **删除保护（评审确认）**：结构化保存时若提交的主机集合缺少平台节点表中仍存在的 IP → 400 并列出，提示先在节点管理删除/停用该节点
6. 任一失败返回 400 + 具体错误（含行号尽量定位），不写文件

### D3. 备份与原子写回

- 每次成功保存前将当前文件复制为 `inventory/host.bak.<YYYYMMDDHHmmss>`，保留最近 **10** 份，超出删除最旧
- 写入采用临时文件 + `os.replace` 原子替换，避免运行中的 ansible/注入逻辑读到半截文件
- **文件缺失处理（评审确认）**：GET 时文件不存在 → 返回空结构（hosts=[]、vars={}、raw_text=""）；PUT 自动创建目录与文件
- 备份文件含明文密码：确保 `backend/ansible/.gitignore` 覆盖 `host.bak.*`（不足则补一行），防止轮转备份进 git
- 界面读写与注入共用 `_inventory_lock`（见 D1）；不再采用"最后写入胜"

### D4. 前端双模式状态机

- 页面加载 → GET 初始化：表格数据 + raw_text 双份草稿
- 表格 → 源码：调 render 接口把表格草稿转 YAML 放入编辑器
- 源码 → 表格：调 parse 接口转换；解析失败则**阻止切换**并在源码视图标错
- 保存按钮按当前视图提交对应载荷；成功后刷新双份草稿并提示"已生效"
- 入口：工具箱分组新页「Ansible 主机清单」，路由 `/ansible-inventory`；`features.yaml` 增加 `ansible_inventory: true`，按自启动管理同款三件套接线（KNOWN_FEATURES、菜单 feature 标记、路由注册）

### D5. 敏感性与权限

- 接口管理员限定；密码明文传输与展示（用户确认接受，内网运维场景）
- 后续如需审计可在 sys_audit_log 记录 PUT 行为（沿用现有审计机制，不在本变更范围强制）

## Risks / Trade-offs

- **明文密码暴露面**：依赖管理员权限约束；接口不走日志脱敏的话响应可能进访问日志——实现时确保不打印响应体。
- **并发编辑最后写入胜**：两个管理员同时编辑互相覆盖；v1 接受，后续可加 updated_at 乐观锁（运行中任务的互斥已由 409 检查解决）。
- **注释天然短命**：运行时注入本身就用 safe_dump 重写整个文件，注释只在两次任务之间存活——源码模式的注释能力定位为"查看与微调"，UI 文案据实提示。
- **与运行时注入并发**：原子替换已消除半截文件风险；极端情况下仍可能覆盖注入中的临时凭据行，概率低，出现时重试任务即可恢复。
