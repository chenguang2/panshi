# dev-tools 变更（tools-keepalived-per-node-nic）

## MODIFIED Requirements

### Requirement: Keepalived 配置生成工具

工具箱 SHALL 提供「Keepalived 配置生成」工具（左侧导航第 14 项，`?tool=keepalived` 深链，纯前端生成、零后端参与），根据用户输入的 VIP 地址（单个）与节点 IP 列表（每行一条 `节点IP 网卡名`，空格分隔，各节点网卡可不同），生成多节点 VRRP 高可用（keepalived 单播模式）的全套配置文件与部署命令。

#### Scenario: 样例逐字回归（3 节点 DNS 高可用）

- **WHEN** 输入 VIP `10.128.216.154`、节点列表三行 `10.128.216.160 ens7` / `10.128.216.161 ens7` / `10.128.216.162 ens7`，高级参数保持默认（掩码 24、组 ID 51、密码 `12345678`、优先级起始 150/步长 10、router_id 前缀 `EDGE_DNS_`、检查端口 53）
- **THEN** 生成的每节点 `keepalived.conf`、`check_dns.sh`、`notify_master.sh`、`notify_backup.sh`、`notify_fault.sh` 与部署命令 SHALL 与用户样例逐字一致（router_id 为 `EDGE_DNS_1/2/3`、priority 为 150/140/130、每节点 `unicast_src_ip` 为本机 IP、`unicast_peer` 为其余节点、VIP 行 `10.128.216.154/24 dev ens7 label ens7:vip`）

#### Scenario: 节点差异仅四处

<!-- 2026-11-10 tools-keepalived-per-node-nic：网卡改为逐节点输入，节点间差异由四处扩为五处（+interface，含 virtual_ipaddress 的 dev/label）；场景标题为稳定标识符故保留原名（AGENTS #53） -->

- **WHEN** 生成 N 节点配置
- **THEN** 各节点 `keepalived.conf` 的差异 SHALL 仅限 `router_id`（前缀+序号）、`priority`（起始值按序递减步长）、`unicast_src_ip`（本机 IP）、`unicast_peer`（其余全部节点，不含本机）、`interface`（本节点行内网卡名，同时决定 `virtual_ipaddress` 的 `dev`/`label`）五处；共用脚本内容对全部节点一致且只输出一份

#### Scenario: 防火墙命令按节点生成

- **WHEN** 生成每节点部署内容
- **THEN** SHALL 包含放行其余 N−1 个对端 IP 的 `firewall-cmd --permanent --add-rich-rule`（source address=对端、protocol vrrp）与 `--reload`，且不包含本机 IP 的放行规则；卡片内 `tcpdump -i` SHALL 使用该节点自己的网卡名；部署手册 SHALL 附「直接放行 VRRP 协议」的备选命令

#### Scenario: 部署与验证命令参数化

- **WHEN** 生成部署手册
- **THEN** `chmod`、`systemctl enable/start`、`keepalived -t -f`、`ip addr show <网卡>:vip`、`ip addr show <网卡> | grep <VIP>`、`journalctl -u keepalived` 等 SHALL 使用用户实际输入的网卡名与 VIP，不残留样例值

#### Scenario: 各节点网卡可不同

- **WHEN** 节点列表各行网卡名不同（如 `ens7`/`eth1`/`bond0`）
- **THEN** 每节点 `keepalived.conf` 的 `interface` 与 `virtual_ipaddress`（`dev`/`label`）SHALL 使用该节点行内网卡名；部署手册 SHALL 按唯一网卡集合逐一列出 `ip addr show` 与 `tcpdump` 验证命令，并注明使用该网卡的节点；所有节点网卡相同时，全部输出 SHALL 与历史版本逐字一致

### Requirement: 生成参数与校验

生成器 SHALL 提供「最小必填 + 高级折叠」两级参数：必填为 VIP 地址（单个）与节点 IP 列表（每行一条 `节点IP 网卡名`，空格分隔，2–8 行），不再提供独立网卡名输入框；高级参数默认收起且默认值等于样例值（VIP 掩码位 24、VRRP 组 ID 51、认证密码 `12345678`、优先级起始 150/步长 10、router_id 前缀 `EDGE_DNS_`、健康检查端口 53）。校验 SHALL 不阻断生成，仅红字（格式/数量/VIP 与节点重复/行缺网卡名或多余列/网卡名非法字符）与黄字提醒（不同网段、密码超 8 字符）。

#### Scenario: 非法输入红字提示

- **WHEN** 任一节点 IP 不是合法 IPv4、节点数少于 2、VIP 与某节点 IP 重复、或某行缺少网卡名/多余列/网卡名含非法字符
- **THEN** 对应输入框下方 SHALL 显示红字说明（行级错误 SHALL 含行号与该行内容），且不生成（或清空）输出

#### Scenario: 黄字提醒不阻断

- **WHEN** VIP 与节点 IP 不在同一网段（按 VIP 掩码位计算），或认证密码超过 8 字符
- **THEN** SHALL 显示黄字提醒（keepalived PASS 认证仅前 8 字符生效等），生成继续进行

#### Scenario: 高级参数修改联动

- **WHEN** 用户修改任一高级参数（如组 ID 改 52、优先级起始改 200）
- **THEN** 生成结果 SHALL 即时反映新值，未修改的参数保持样例默认值
