# relay-channel-routing Specification

## Purpose

跨中心节点的三条管理通道寻址：HTTP 腿经区域网关（`X-Edge-Target`）、裸 SSH 经 `-J` 跳板、Ansible 运行期 ProxyJump 注入；含跳板解析的歧义防护、禁用回退提示、网关白名单 403 可定位报错、自跳守卫、连接类失败重试，以及面向运维的路径可见性契约（逐节点 `route`/`relay_via` 字段、展示命令与实时日志的中继说明行）。

## Requirements

### Requirement: Edge Admin API 经网关寻址
当全局总开关开启且节点所属区域配置了 `http_base_url` 时，EdgeClient SHALL 将请求发往该区域网关地址，并在请求头 `X-Edge-Target` 中携带真实节点目标（`节点IP:management_port`）；SM4 加密载荷与 `EDGE_ADMIN_KEY` 认证 SHALL 保持端到端不变。

#### Scenario: 网关模式请求
- **WHEN** luju 区域节点（192.168.0.13:16620）发布路由且区域路由已配置
- **THEN** 请求发往 `http://10.10.1.1:8443`，请求头含 `X-Edge-Target: 192.168.0.13:16620`，载荷加密方式不变

#### Scenario: 直连模式不受影响
- **WHEN** 全局总开关关闭，或节点区域路由为空/被禁用
- **THEN** EdgeClient 按节点真实 IP 直连，请求中不携带 `X-Edge-Target`

### Requirement: 裸 SSH 经跳板寻址
当全局总开关开启且节点所属区域配置了 `ssh_jump` 时，`_build_ssh_cmd` 生成的 SSH 命令 SHALL 携带 `-J` 跳板选项（含该局跳板）；该行为 SHALL 覆盖全部裸 SSH 调用方（edge_autostart 与 node_task_service 的脚本执行、文件分发）。跳板专用密钥（专用 `tunnel` 账号 + `relay_ed25519` + `PermitOpen`）属**部署建议**：仅当密钥文件（`EDGE_RELAY_SSH_KEY`，缺省 `~/.ssh/relay_ed25519`）存在时才注入 `-i`，缺失时 SHALL 省略 `-i` 并回退平台默认 SSH 身份/config/agent（不报错、不污染命令回显）。

#### Scenario: 跳板模式命令
- **WHEN** 对 luju 区域节点执行自启动状态查询且区域跳板已配置
- **THEN** 生成的 ssh 命令含 `-J tunnel@10.10.1.1:22`，节点目标仍为真实 IP；若跳板专用密钥文件存在则同时含其 `-i` 参数，否则省略 `-i`

#### Scenario: 跳板信息回显
- **WHEN** 命令构造成功并生成前端展示用完整命令
- **THEN** 展示命令与实际执行命令一致（均含跳板段），运维可直接手工复现

#### Scenario: 直连模式不受影响
- **WHEN** 全局总开关关闭，或节点区域跳板为空/被禁用
- **THEN** 生成的 ssh 命令不含 `-J`，与现状一致

### Requirement: Ansible 经 ProxyJump 寻址
inventory 为用户管理的清单文件。当全局总开关开启时，系统 SHALL 在 ansible 运行前按目标节点所在区域**运行期注入** `ansible_ssh_common_args`（ProxyCommand 指向该局跳板），运行结束后 SHALL 恢复原状（不落盘修改用户清单）；节点真实 IP、`ansible_port`、`ansible_ssh_pass` SHALL 保持原样。

#### Scenario: 运行前注入跳板参数
- **WHEN** 对 luju 区域节点执行 playbook 且跳板已配置
- **THEN** 运行期间该节点行携带指向 luju 跳板的 ProxyCommand，运行结束后恢复原状

#### Scenario: 不同区域不同跳板
- **WHEN** 批量目标分属 luju 与 tianjin 两区域
- **THEN** 跨区域整体注入不支持：不注入（回退直连）并记录告警

#### Scenario: 密码红线保持
- **WHEN** 任何寻址开关组合下注入/恢复
- **THEN** `ansible_ssh_pass` 明文原样保留，不做掩码或改写

### Requirement: 跳板解析的歧义防护
`resolve_relay_jump(ip)` 解析 SHALL 基于**区域注册快照**（DB 为唯一事实源；TTL 缓存 + 注册表 CRUD 后由端点显式 `ensure_fresh(force=True)` **立即重载**（仅 `invalidate()` 置脏标记不足：同步消费方不判 TTL，会让变更等到进程重启才生效）；同步消费方零 IO 读取）。当数据库中该 ip 命中多个节点且区域不一致时，SHALL 回退直连并记录告警日志。

#### Scenario: 同 IP 跨集群歧义
- **WHEN** 两个不同区域的集群各含节点 192.168.1.10
- **THEN** 解析判定为歧义：回退直连路径并记录歧义告警

#### Scenario: 注册表变更即时生效
- **WHEN** 设置页新增/修改/禁用区域后
- **THEN** 后续解析立即使用新快照（无需重启）

### Requirement: 禁用路由的直连回退提示
当节点所属区域的路由被禁用或未生效时，系统 SHALL 回退直连路径执行；若执行出现连接类失败且该节点存在此类路由配置，错误信息 SHALL 附加提示"该区域中继已禁用，直连通常不可达"。

#### Scenario: 禁用后的失败可解释
- **WHEN** luju 区域被禁用后对 luju 节点发布配置且直连超时
- **THEN** 操作按失败返回，错误信息含中继已禁用提示

### Requirement: 网关白名单错误可定位
网关模式下收到网关返回的 403（目标不在白名单）时，系统 SHALL 将错误信息映射为可定位提示："目标不在该局网关白名单，请执行配置下发"。

#### Scenario: 白名单漂移的可定位报错
- **WHEN** 节点换 IP 后未触发下发，经网关发布配置收到 403
- **THEN** 错误信息为白名单下发提示而非 Edge 原始错误

### Requirement: 连接类失败立即重试
当跳板/网关寻址启用时，`_run_ssh_with_fallback` 对连接类失败（connection refused / timeout）SHALL 立即重试一次；重试成功 SHALL 按成功处理。

#### Scenario: 漂移窗口内重试
- **WHEN** 首次连接因跳板 VIP 漂移被拒，重试时新 MASTER 已就绪
- **THEN** 第二次连接成功，操作按成功返回

### Requirement: 跳板自环防护
当目标节点 ip 与其所属区域的跳板主机相同时（网关机同时被当作该集群业务节点）`ssh_jump_for_ip(ip)` SHALL 返回 None，该 ip SHALL 视同直连（ansible 不注入 `ansible_ssh_common_args`、裸 SSH 不带 `-J`）。

#### Scenario: 网关机自身作为业务节点
- **WHEN** aoh 网关为 `jboss@192.168.0.13`，且同一集群存在业务节点 192.168.0.13
- **THEN** 该节点回退直连，不注入跳板；若强行经自身跳板，ssh 会报 `jumphost loop`（实测 rc=4 `Connection closed by UNKNOWN port 65535`）

### Requirement: 中继路由在展示命令中可见
ansible 跳板是**运行期**以 `ansible_ssh_common_args` 注入清单、不在 `ansible-playbook` 命令行中的，因此系统 SHALL 在返回给界面展示的 command 中追加中继说明行，使运维无需抓取清单即可判断是否走中继。

#### Scenario: 展示命令标注中继
- **WHEN** 本次 playbook 运行期为目标 ip 注入了跳板 ProxyCommand
- **THEN** 展示用 command 追加 `# [中继] 经跳板 <jump>（清单 ansible_ssh_common_args，运行期注入、已还原）`

### Requirement: 逐节点结果携带执行路径字段
凡经平台代为访问 Edge 节点的操作（配置发布/删除、连接测试、Edge 直连查询、数据导入、自启动、版本列表等），其逐节点结果或响应 SHALL 携带 `route` 字段（`"relay"` 或 `"direct"`）；经中继时 SHALL 另附 `relay_via`——HTTP 腿为网关基址，SSH/Ansible 腿为跳板主机串——直连 SHALL 不含 `relay_via` 键。路径判定 SHALL 在发起请求**之前**按该次实际使用的连接实例（HTTP 腿 `mark_route`）或跳板解析（SSH/Ansible 腿 `ssh_jump_for_ip`）取值，与实际执行路径同源；失败响应同样携带。前端 SHALL 复用 `routeLabel` 渲染「（经中继）/（直连）」，字段缺失时不渲染（向后兼容）。

#### Scenario: HTTP 腿（Edge 直连查询/数据导入）
- **WHEN** 中继开启且区域路由生效时执行 Edge 直连查询或数据导入 test-connection/preview/execute
- **THEN** 响应含 `route: "relay"` 与 `relay_via=<网关基址>`；总开关关闭时 `route: "direct"` 且无 `relay_via`

#### Scenario: SSE 首事件（自启动）
- **WHEN** 自启动启用/禁用/状态查询的 SSE 流开始
- **THEN** 首个事件携带 `route`/`relay_via`，进度与终态事件不变；前端经 `useInstallStream` 的 `onMeta` 一次性接收（未知 route 值不触发回调，旧事件流零行为变化）

#### Scenario: 版本列表（edge-pack-list）
- **WHEN** 拉取节点可选版本列表且判定发生在 ansible 发起前
- **THEN** 响应附 `route`/`relay_via`，前端目标版本标签旁显示「（经中继）/（直连）」

#### Scenario: 缺省向后兼容
- **WHEN** 响应或事件未携带 `route` 字段
- **THEN** 前端不渲染任何路径标注

### Requirement: SSH 腿展示中继说明
裸 SSH 调用方（cmd_exec 脚本模式、software_check 降级、install_openresty 第二阶段）SHALL 在展示日志中追加与 `_build_ssh_cmd` 的 `-J` 注入同源的中继说明行（`ssh_relay_note`，含自跳守卫），直连时不追加；software_check 降级提示 SHALL 按实际路由显示「降级为 SSH 执行（经中继/直连）」，不得硬编码「直连」。

#### Scenario: 脚本执行经中继
- **WHEN** 中继开启且节点区域配置了跳板时执行 cmd_exec 脚本模式
- **THEN** 实时日志出现中继说明行（`# [中继] 经跳板 <jump>（SSH -J）`）；直连时无该行

#### Scenario: 降级文案按实际路由
- **WHEN** software_check 的 ansible 查询失败、降级为 SSH 执行
- **THEN** 提示为「降级为 SSH 执行（经中继）」或「降级为 SSH 执行（直连）」

### Requirement: 节点任务展示命令透传
software_check、cmd_exec（普通模式）与 distribute_file 的结果 SHALL 透传 `run_playbook` 返回的展示用 command（含中继说明行）到逐节点 `item.command`，供前端命令 tab 显示。

#### Scenario: 命令 tab 可见中继标记
- **WHEN** 软件查询/命令执行/分发文件任一任务完成且本次运行经跳板
- **THEN** 逐节点 `item.command` 含 `# [中继] 经跳板 …`，前端命令 tab 正常显示（此前这些路径丢弃该字段导致界面不可见）
