# Design: relay-gateway-inventory-ui

## Context

现状三事实源格局：`relay_gateways` 表管路由语义（唯一事实源，#50 快照派生自它），`inventory/gateways` 文件管 SSH 连接凭据（手工维护），`relay_sshd` 临时行做运行期凭据注入（M23 机制）。Ansible 主机清单模块（`inventory_service.py`）已有成熟的「YAML parse/render + 自动备份 + 双模式编辑」范式可复用。

## Goals / Non-Goals

- Goals：凭据有唯一权威落点（DB）；文件 100% 派生（手改不再必要）；CRUD → 渲染写盘 → 备份 → 审计闭环；存量文件自动迁移。
- Non-Goals：不做网关 SSH 连通性测试按钮（init/push 流本身即验证）；不改 relay_sshd 注入机制；不做文件手改回读（见决策点 4）；不动 #10 的节点清单明文约定。

## Decisions

### D1 归属页面 = 中继区域管理（不新开菜单、不进主机清单页）

三选一对比：

| 选项 | 评估 |
|---|---|
| **中继区域管理（选定）** | 实体 1:1（一个网关注册 ↔ 清单一个分组）；#61 四层接线现成（页面/路由/权限已在 relay_gateway 门控下）；凭据随网关生命周期管理，语义内聚 |
| Ansible 主机清单页 | 域错位：该页管**业务节点**（按集群分组、服务/管理端口语义）；网关机是中继域资产，混入会让两域运维互相污染；且该页 parse/渲染面向 host 文件格式 |
| 新左侧菜单项 | 表面增长无新增能力；清单只是网关注册的派生物，独立页面是过度设计 |

#61 影响评估：本 change 不新增路由/菜单，四层门控全部继承 relay_gateway 既有接线，②③层 N/A。

### D2 凭据存储 = DB 明文列（对齐 #10），文件为派生成品

- 备选 Fernet 加密（db_config 先例）被否：① #10 已确立「运维清单密码明文、界面可见可复制」的平台约定（其理由——运维需要真实口令做核对/分发——对本域同样成立）；② 文件在 ansible 运行期必须是明文，加密只改变存储位置不改变暴露面；③ 加密密钥绑定 JWT secret（#20），换 key 会造成凭据不可解的连带故障面。
- 缓解：文件已 gitignore（2026-11-05 批次 A）；文件头标注生成语义；前端表格默认密码框展示、点击可见（与主机清单页交互一致）。

### D3 渲染时机 = CRUD 保存即整组重写（非运行期渲染）

- 保存/启停/删除网关 → `gateways_inventory_service.render_and_write()` 按 DB 全量重渲染文件（按局分组，含全部网关）→ 旧文件先备份 `gateways.bak.<ts>`（对齐 host.bak.* 范式，保留最近 N 份）→ 原子写（tmp + rename）→ 0600 收权（复用 `ensure_gateways_perms`）。
  - 实现微调（真链路验收确认）：**备份仅在「被覆盖文件非本系统生成」时创建**——迁移首次接管时备份手工原稿；此后文件是 DB 的可重现派生物，逐次备份只会用机器噪声占满 10 槽轮换，失去保护意义。手工内容找回走迁移备份。
- 不选「运行期临时渲染」：relay_sshd 的临时注入机制依赖「基础文件稳定存在」；CRUD 时点写盘让注入/还原的差量语义保持不变。
- 新增网关但清单渲染失败（磁盘/权限）→ 保存仍成功但列表 API 的 `inventory_group_missing` 标志变 true（该标志已存在，前端补展示），重试入口 = 重新保存。

### D4 存量迁移 = 首次启动自动导入 + 文件头改写

- 迁移函数幂等：检测文件头无「由系统生成」标注 → 备份原文件 → 解析 YAML → 按 IP+ansible_user 匹配 `relay_gateways` 行回填凭据字段 → 渲染新文件（带头标注）→ 写迁移审计。
- 匹配不上的文件分组（文件有、DB 无）：保留在文件中（原样并入渲染结果）并在列表 API 暴露「孤儿分组」计数，由运维决定删留——不静默丢弃。
- 手改文件在迁移后的语义：下次任何网关 CRUD 会整组覆盖。文件头标注 + 手册说明；不做「从文件回读」功能（手工修正场景由「重新保存网关」覆盖，需要时运维仍可先手改再触发一次保存前的备份找回）。

### D5 API 与前端形态

- `RelayGatewayCreate/Update` schema 增字段：`ssh_user`（必填）、`ssh_password`（可选，空 = 密钥认证）、`ssh_port`（默认 22）、`ansible_python_interpreter`（可选）、`ssh_common_args`（可选，默认现文件的 StrictHostKeyChecking 组合）。
- `RelayGatewayOut` 返回 `ssh_user/ssh_port/ssh_common_args/ansible_python_interpreter` 明文 + `ssh_password` 仅在编辑场景需要时由前端按需取（GET 列表不回传口令；新增 `GET /relay/gateways/{id}/credential` 单查口令，权限同页面 + 审计覆盖）——对比主机清单页「列表即明文」更保守一步：网关机是 root/jboss 级入口，泄露面更敏感。
- 前端：表格列补「SSH 用户」；表单补「SSH 连接」分组（用户/密码/端口/解释器/公共参数）；列表在 `inventory_group_missing=true` 行显示「清单缺失」徽标（点击 = 打开配置预览抽屉查看渲染结果）。

## Risks / Trade-offs

- DB 泄露面 = SQLite 文件本身（内网测试环境，#10 同口径接受）。
- 渲染写盘与 relay_sshd 临时注入并发：注入期间恰有 CRUD → 整组重写会带走临时行 → 注入 finally 还原时按行不存在即跳过（现状代码已是幂等还原，需补回归用例钉住）。
- 多 worker 部署下 CRUD 与运行中 ansible 并发读文件：原子写（rename）保证读者只见完整旧/新文件。

## Migration Plan

1. COLUMN_MIGRATIONS 加列 → 启动迁移。
2. lifespan 早期调用 `migrate_gateways_file()`（幂等，见 D4）。
3. 手册 28 章补「SSH 连接」字段表与迁移说明。

## Open Questions（随 proposal 决策点一并呈报）

- 凭据单查端点（D5）是否过度设计？若你倾向与主机清单页完全一致（列表即明文），撤掉单查端点、列表直出。
