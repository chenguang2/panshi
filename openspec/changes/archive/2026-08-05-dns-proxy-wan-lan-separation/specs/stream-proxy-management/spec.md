## MODIFIED Requirements

### Requirement: DNS 模式域名配置

DNS 模式四层代理 SHALL 支持每个域名独立配置 TTL、健康检查和可选的日志生成。

#### Scenario: TTL 配置
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 每个域名行 SHALL 显示 TTL 输入框（默认 10，单位秒）
- **AND** 发布到 Edge 时 SHALL 将 `ttl_valid` 字段写入 dns_upstream hosts

#### Scenario: DNS 模式健康检查（默认开启）
- **WHEN** 用户新建 DNS 域名
- **THEN** 健康检查复选框 SHALL 默认勾选
- **AND** JSON 编辑器 SHALL 默认填充 `{"type": "http", "active": {}, "passive": {}}`
- **AND** 发布到 Edge 时 SHALL 将 checks 写入每个域名

#### Scenario: DNS 模式健康检查（关闭）
- **WHEN** 用户取消勾选健康检查复选框
- **THEN** 该域名的 checks SHALL 不包含在发布的配置中

#### Scenario: DNS 模式生成日志
- **WHEN** 用户勾选"生成日志"复选框
- **THEN** 发布的 `plugins` SHALL 包含 `"log_process": {"logs": ["logs/process.stream.log"]}`
- **AND** 生成日志复选框 SHALL 默认不勾选

#### Scenario: DNS 模式编辑回读
- **WHEN** 用户编辑已有的 DNS 四层代理
- **THEN** 已有域名的健康检查状态 SHALL 根据 `cfg.checks` 是否存在决定
- **AND** JSON 编辑器 SHALL 回显已有 checks
- **AND** log_process SHALL 根据 `dns_config.log_process` 是否存在决定复选框状态

#### Scenario: DNS 目标节点字段校验
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 每个域名下的目标节点 SHALL 使用独立的 IP 和端口输入框
- **AND** IP 字段 SHALL 校验格式（IPv4）
- **AND** 端口字段 SHALL 校验范围（1-65535）

#### Scenario: 协议与 DNS 模式说明
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 协议区域 SHALL 显示 `UDP` 徽标，并在同一行显示说明文字「DNS 模式下，请求将使用 dns_upstream 插件进行域名解析，不配置标准上游节点。」
- **AND** 页面 SHALL NOT 显示独立的上游配置占位区域（`{"type": "roundrobin", "scheme": "tcp"}` 已移除）

## ADDED Requirements

### Requirement: DNS 模式内外网分离配置

DNS 模式四层代理 SHALL 支持内外网分离（WAN/LAN）配置：通过开关启用后，额外生成 `dns_upstream-ww` 插件，按来源 IP 区分内/外网 DNS 查询返回。该配置 SHALL 以开关式内联在 DNS 模式表单中，并保持向后兼容（未启用时行为与现状完全一致）。

#### Scenario: 内外网分离开关（第一页）
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 表单第一步（端口选择页）SHALL 提供「启用内外网分离」复选框（默认关闭）
- **AND** 未启用时发布的 `plugins` SHALL 仅包含 `dns_upstream`（不含 `dns_upstream-ww`），与现状一致
- **AND** 启用后发布 SHALL 额外生成 `dns_upstream-ww` 插件
- **AND** DNS 代理的 `scheme` SHALL 固定为 `udp`（创建/更新时后端强制为 udp，忽略客户端传入的 scheme；发布时 Edge `protocol` 为 `UDP`）

#### Scenario: 域名配置单次输入 + 节点行内联外网地址
- **WHEN** 内外网分离已启用
- **THEN** 域名/负载均衡/TTL/健康检查 SHALL 与未启用时一样只输入一次（不复制域名配置）
- **AND** 每个目标节点行 SHALL 增加「外网地址」列（仅开关开启时显示）
- **AND** 外网地址 SHALL 只填写 IPv4（端口复用内网端口，不支持 IPv6/CIDR）
- **AND** 提交时 SHALL 将各节点外网地址组装为该域名下的 `export_nodes`（key=内网 `ip:port`，value=外网 IP）

#### Scenario: 外网访问来源过滤（_meta.filter）
- **WHEN** 内外网分离已启用
- **THEN** 表单 SHALL 提供「包含 IP/网段」与「排除 IP/网段」两个可编辑列表（支持 IPv4 与 CIDR）
- **AND** 发布时 SHALL 将包含列表生成**一个** `["remote_addr", "ip~", [ips]]` 条件（列表内 IP 为 OR 关系）
- **AND** 发布时 SHALL 将排除列表生成**一个** `["remote_addr", "!", "ip~", [ips]]` 条件（列表内 IP 为 OR 关系）
- **AND** `dns_upstream-ww._meta.priority` SHALL 固定为 `2110`（用户不可修改）
- **AND** `_meta.filter` 最外层数组内各条件 SHALL 按 AND 关系判定（来源需满足全部条件才由 ww 插件接管返回外网地址，否则落到内网 `dns_upstream`）

#### Scenario: 映射完整性校验（强化）
- **WHEN** 用户保存或发布已启用内外网分离的 DNS 代理，且某域名存在未填写外网地址的节点
- **THEN** 系统 SHALL 拒绝保存/发布并提示「启用内外网分离时每个节点的外网地址必须填写」（前端与后端双重拦截，防止未映射节点对外网查询返回内网地址泄露拓扑）
- **WHEN** 用户保存或发布已启用内外网分离的 DNS 代理，且某外网地址不是合法 IPv4
- **THEN** 系统 SHALL 拒绝保存/发布并提示格式错误
- **WHEN** 用户保存或发布已启用内外网分离的 DNS 代理，且 `wan_filter` 的包含/排除列表含非法 IP 或网段（如 `127..0.0.1`）
- **THEN** 系统 SHALL 拒绝保存/发布并提示具体非法值（前端添加时即校验拦截，后端发布时二次校验，防止非法 IP 透传到 Edge 导致 `dns_upstream-ww` 插件崩溃返回 502）

#### Scenario: 开关切换保留数据
- **WHEN** 用户在编辑已启用内外网分离的代理时关闭开关，随后重新打开
- **THEN** 已填写的节点外网地址数据 SHALL 保留（不清空）
- **AND** 关闭状态下保存 SHALL 不组装 export_nodes（`wan_*` 不写入）

#### Scenario: 客户端 CIDR 隐藏
- **WHEN** 用户创建或编辑 DNS 模式四层代理
- **THEN** 域名目标节点的「客户端 CIDR」输入框 SHALL 默认隐藏（不展示）
- **AND** CIDR 值 SHALL 始终为空，提交时不写入 nodes（nodes 值为空数组）

#### Scenario: 详情页展示内外网分离状态
- **WHEN** 用户查看 DNS 模式四层代理的详情
- **THEN** 若 `dns_config.wan_enabled` 为 true，详情页 SHALL 展示「内外网分离」状态徽标
- **AND** 若未启用，详情页 SHALL 不展示该徽标

#### Scenario: 编辑回读与导入兼容
- **WHEN** 用户编辑已启用内外网分离的 DNS 四层代理，或从 Edge 导入含 `dns_upstream-ww` 插件的配置
- **THEN** 开关 SHALL 回显为开启
- **AND** `export_nodes` 映射 SHALL 还原到各域名节点行的外网地址列（值去除端口）
- **AND** `_meta.filter` SHALL 还原为包含/排除列表（包含条件 → include 列表，排除条件 → exclude 列表）
- **WHEN** Edge 配置不含 `dns_upstream-ww` 插件
- **THEN** 开关 SHALL 为关闭，且 `wan_*` 字段 SHALL 不写入持久化配置
