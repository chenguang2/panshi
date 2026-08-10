## Context

目标节点 SSH 端口非标准 22（如 1122）时，所有远程操作失败。根因（已代码确认）：

- `_build_ssh_cmd`（ansible_service.py:36）构造 ssh 命令无 `-p` 参数，`f"{ssh_user}@{ip}"` 直连默认 22
- inventory/host 无 `ansible_port`，ansible 路径同样默认 22
- Node 模型无 SSH 端口字段，前端无法配置

inventory/host 由**运维手写**（ansible_service.py:359 注释确认），非程序生成——因此端口配置应**以 Node 模型为准**（用户通过 UI 配置），inventory 仅作 `get_ssh_port` 的 fallback。

## Goals / Non-Goals

**Goals:**
- Node 支持配置 SSH 端口（默认 22，向后兼容）
- 直连 SSH 路径（`_build_ssh_cmd` 系列）注入 `-p <port>`
- Ansible 路径（run_playbook）动态注入 inventory `ansible_port`，与直连路径端口一致
- 全链路透传：安装 OpenResty、取消安装、软件查询、命令执行
- 未配置端口时行为与现状完全一致

**Non-Goals:**
- 修改 inventory/host 的运维手写模式（保留；动态注入为执行期临时行为，执行后恢复）
- 支持每节点多 SSH 端口/多认证方式（YAGNI）
- 前端 SSH 端口校验以外的 UI 改动
- inventory 读取缓存（沿用现状每次读文件——运维手写文件 + 动态注入后需重读，缓存反增复杂度）

## Decisions

### Decision 1: `Node.ssh_port` 字段（默认 22，Nullable）

ORM 模型加 `ssh_port = Column(Integer, nullable=True)`（None 表示默认 22，与现有 `service_port`/`management_port` 风格一致但可空以保持旧数据兼容）：

- `NodeBase`/`NodeCreate`/`NodeUpdate`/`NodeResponse` schema 加 `ssh_port: Optional[int] = Field(None, ge=1, le=65535)`
- DB 迁移：`ALTER TABLE ps_node ADD COLUMN ssh_port INTEGER`（None = 默认 22）

**备选**：非空默认 22——否决，None 语义更清晰（未配置 vs 显式 22），且迁移零数据修复。

### Decision 2: `_build_ssh_cmd` 加 port 参数

```python
def _build_ssh_cmd(ip, ssh_user, cmd, password=None, port=None) -> list[str]:
    base_opts = ["-o", "ConnectTimeout=30", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null"]
    if port and port != 22:
        base_opts += ["-p", str(port)]
    # 其余不变（sshpass/ssh -i key）
```

`_run_ssh_with_fallback` 增加 `port` 参数并透传给 `_build_ssh_cmd`。

### Decision 2a: `_ssh_run` 改签名加 port（评审确认）

`_ssh_run(ip, cmd, ssh_user, port=None)` 增加 port 参数并透传给 `_run_ssh_with_fallback`——原签名只有 ip，无法访问 node.ssh_port。取消安装调用点（cluster_install.py 383/395/402 行）从当前 `node` 对象 `resolve_ssh_port(node)` 后传入。

### Decision 3: `get_ssh_port(ip)` 解析（inventory fallback）

与 `get_ssh_user`/`get_ssh_password` 同款，从 inventory 读取：

```python
def get_ssh_port(ip) -> int | None:
    # host 级 ansible_port → group vars → None（默认 22）
```

**优先级说明**：调用方（如 cluster_install）优先用 `node.ssh_port`；若为 None 再 fallback `get_ssh_port(ip)`；仍 None 则默认 22。Node 配置优先于 inventory（用户显式配置应覆盖手写文件）。

**注（评审确认）**：不缓存——inventory 是运维手写文件，且动态注入后必须重新读，缓存反增复杂度。

### Decision 4: 调用点统一透传

| 调用点 | 端口来源 |
|---|---|
| `cluster_install._install_openresty_stream`（248/267 行两轮） | `resolve_ssh_port(node)` |
| `cluster_install._ssh_run`（取消安装 294 行，改签名后） | 调用方 `resolve_ssh_port(node)` 传入 |
| `node_task_service` 软件查询（547 行）/命令执行（678 行） | `resolve_ssh_port(node)`（函数已有 node 对象） |

统一封装 helper：`resolve_ssh_port(node) -> int`（Node 模型 → inventory → 22），避免各调用点重复逻辑。

### Decision 4a: Ansible 路径动态注入 inventory（评审确认）

ansible 路径（`install_openresty_copy`/`install_edge`/`nginx_cmd_run`/`edge_statistic`/`software_check_run` 等）走 inventory——若只修直连路径，同一节点直连用 1122 而 ansible 用 22，体验割裂。方案：**在 `AnsibleRunnerService.run_playbook` 内统一注入**：

```python
async def run_playbook(self, ip, tag, extravars=None, ..., ssh_port: int | None = None):
    # 1. 解析端口：ssh_port 参数（调用方传 node.ssh_port）→ get_ssh_port(ip) → 22
    # 2. 若端口非 22 且与 inventory 当前值不同：临时更新该主机的 ansible_port
    # 3. 执行 playbook
    # 4. finally 恢复 inventory 原值
```

- **注入位置**：run_playbook 内统一，所有 ansible 调用点自动生效，无需改各调用点
- **恢复策略**：临时注入 + 执行后恢复原值，不残留；并发执行需文件锁（threading.Lock + 每次重新读文件）
- **端口来源**：新增可选 `ssh_port` 参数（调用方传 node.ssh_port 时优先），否则 `get_ssh_port(ip)` 兜底——与 `resolve_ssh_port` 语义一致

**备选**：各调用点显式包装——否决，重复且易漏；extravars 透传 `ansible_port`——ansible 的连接端口不经 extravars，需用 `ansible_ssh_common_args` 等，侵入性更强。

### Decision 5: 前端 SSH 端口配置

- `useClusterNodes.ts`：`nodeForm` 加 `ssh_port`（默认 22），列配置加「SSH 端口」
- 节点编辑弹窗：SSH 端口输入（数字，1-65535，placeholder 提示默认 22）
- `NodeResponse` 返回 `ssh_port`，编辑回填

## Risks / Trade-offs

- [两套端口来源] Node.ssh_port 与 inventory ansible_port 可能不一致——Node 优先 + run_playbook 动态注入保证 ansible 路径与直连一致
- [inventory 动态注入] 执行期临时修改手写文件——需文件锁防并发，执行后恢复原值不残留；注入/恢复失败时记录日志但不阻断（ansible 按原配置尝试）
- [SSH 命令变化] 非 22 端口才注入 `-p`——22 或 None 时命令与现状逐字节一致，零回归风险
- [迁移] 新增可空列，旧数据无影响
- [前端] 新增字段默认 22，不配置则行为不变

## Migration Plan

1. DB：`ALTER TABLE ps_node ADD COLUMN ssh_port INTEGER`（可空，None=默认 22）
2. 后端 schema + 模型 + 服务层端口透传（直连 `-p` + ansible 动态注入）
3. 前端节点表单/列配置
4. 部署顺序：后端先（兼容旧前端不传 ssh_port）→ 前端

## Open Questions

无（评审确认：`_ssh_run` 改签名传 port、ansible 动态注入 inventory、临时注入+恢复、run_playbook 内统一封装、前端独立 SSH 端口字段）。
