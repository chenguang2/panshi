## MODIFIED Requirements

### Requirement: DNS 类型代理导入

系统 SHALL 支持导入 DNS 类型的四层代理（stream proxy with proxy_type=dns）。

#### Scenario: 自动识别 DNS 类型
- **WHEN** Edge 节点的 Stream Route 数据包含 `plugins.dns_upstream` 字段
- **THEN** 系统 SHALL 自动设置 `proxy_type = "dns"`
- **AND** 系统 SHALL 将 `plugins.dns_upstream` 写入 `dns_config` 字段
- **AND** 系统 SHALL 将 `plugins.log_process` 合并到 `dns_config.log_process` 中
- **AND** 系统 SHALL 设置 `scheme = "udp"`
- **AND** 系统 SHALL NOT 从 `upstream.nodes` 提取目标节点

#### Scenario: 导入内外网分离配置（dns_upstream-ww）
- **WHEN** Edge 节点的 Stream Route 数据包含 `plugins.dns_upstream-ww` 字段
- **THEN** 系统 SHALL 设置 `dns_config.wan_enabled = true`
- **AND** 系统 SHALL 将 `dns_upstream-ww.hosts.<domain>.export_nodes` 还原到 `dns_config.hosts.<domain>.export_nodes`（值去除端口，仅保留外网 IP；端口由内网节点 key 隐含复用）
- **AND** 系统 SHALL 从 `dns_upstream-ww._meta.filter` 还原 `dns_config.wan_filter`（`["remote_addr","ip~",[ips]]` 条件 → include 列表，`["remote_addr","!","ip~",[ips]]` 条件 → exclude 列表）
- **AND** `dns_upstream-ww` 插件本身的 hosts/nodes SHALL NOT 被写入 `dns_config.hosts` 的 nodes（nodes 仅保留内网 `dns_upstream` 部分）
- **WHEN** `dns_upstream-ww` 中的某域名在内网 `dns_upstream` hosts 中不存在
- **THEN** 系统 SHALL 丢弃该域名的 export_nodes 映射并在导入预览中告警（不创建只有映射的空域名）

#### Scenario: 不含内外网分离时行为不变
- **WHEN** Edge 节点的 Stream Route 数据包含 `plugins.dns_upstream` 但不包含 `plugins.dns_upstream-ww`
- **THEN** `dns_config` SHALL 不包含 `wan_enabled`/`wan_filter`/`export_nodes` 字段
- **AND** 开关在编辑界面 SHALL 显示为关闭

#### Scenario: 普通类型保持不变
- **WHEN** Edge 节点的 Stream Route 数据不包含 `plugins.dns_upstream`
- **THEN** 系统 SHALL 按普通类型处理（`proxy_type = "normal"`）
- **AND** 系统 SHALL 从 `upstream.nodes` 解析目标节点

#### Scenario: 跳过冲突
- **WHEN** 导入时遇到冲突且用户选择跳过
- **THEN** 系统 SHALL 跳过该记录，不写入 DB
- **AND** 记录到导入日志中
