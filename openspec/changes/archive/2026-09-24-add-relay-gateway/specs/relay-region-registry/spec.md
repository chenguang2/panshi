## ADDED Requirements

### Requirement: 区域注册表数据模型
系统 SHALL 提供 `relay_gateways` 表存储跨中心区域注册信息，字段至少包含：`code`（区域码，唯一）、`name`（展示名）、`http_base_url`（该局网关 HTTP 腿地址，可空）、`ssh_jump`（该局 SSH 跳板，可空）、`status`（enabled/disabled）。

#### Scenario: 创建区域
- **WHEN** 管理员在设置页提交区域（如 code=luju, http_base_url=http://10.10.1.1:8443, ssh_jump=tunnel@10.10.1.1:22）
- **THEN** 区域记录落库并可被集群挂接；`code` 重复时创建被拒绝

#### Scenario: 直连区域
- **WHEN** 某区域的 `http_base_url` 与 `ssh_jump` 均为空（如武清本地）
- **THEN** 该区域节点的三条管理通道全部按现状直连路径执行

### Requirement: 集群挂接区域
系统 SHALL 允许为每个集群指定所属区域（`region_code`），节点通道寻址 SHALL 以节点所属集群的区域为准解析；`region_code` 为空的集群（存量默认态）SHALL 按直连区域处理。

#### Scenario: 集群设置区域
- **WHEN** 管理员将某集群的区域设为 luju
- **THEN** 该集群全部节点的通道寻址按 luju 区域的路由配置解析

#### Scenario: 未挂接区域的存量集群
- **WHEN** 集群的 `region_code` 为空
- **THEN** 该集群全部节点按直连路径执行

#### Scenario: 区域不存在
- **WHEN** 集群挂接的区域 `code` 在注册表中不存在
- **THEN** 该集群节点按直连路径执行，并在寻址解析处记录告警日志

### Requirement: 区域启停
系统 SHALL 支持在设置页对单个区域执行启用/禁用；禁用区域的节点 SHALL 回退直连路径，不影响其他区域。

#### Scenario: 禁用单局
- **WHEN** 管理员将 luju 区域置为 disabled
- **THEN** luju 区域节点立即按直连路径解析，luju 区域以外节点不受影响

### Requirement: 全局总开关
系统 SHALL 提供 `features.yaml` 的 `features.relay_gateway` 作为全局总开关（显式 opt-in，默认 `false`，不沿用 features.yaml 的"未列出即启用"约定）；关闭时所有区域一律按直连路径执行，无论区域配置如何。该开关经 `app.core.features` 的 mtime 热加载读取，改完即时生效、无需重启。

#### Scenario: 一键回退
- **WHEN** `features.yaml` 中 `relay_gateway: false`
- **THEN** 所有节点通道寻址按现状直连路径执行，行为与本变更合入前一致

#### Scenario: 开关热生效
- **WHEN** 管理员将 `features.yaml` 的 `relay_gateway` 由 `false` 改为 `true`
- **THEN** 无需重启后端，后续寻址即按区域网关路径（HTTP `X-Edge-Target` / SSH `-J`）执行

### Requirement: 区域连通性测试
设置页 SHALL 提供单区域连通性测试动作，按区域路由依次探测：网关 HTTP 腿可达、SSH 跳板可达。

#### Scenario: 区域测试通过
- **WHEN** 管理员对 luju 区域执行连通性测试且两腿均可达
- **THEN** 返回分段成功结果与耗时

#### Scenario: 区域测试失败
- **WHEN** 区域测试中某一腿不可达
- **THEN** 返回标明失败段的分段结果，不中断其他段的探测

### Requirement: 区域 code 格式与不可变性
区域 `code` SHALL 匹配 `^[a-z][a-z0-9-]{1,31}$`（用于 fleet 组名与渲染文件名）；`code` 创建后 SHALL 不可修改，仅允许修改 `name`、路由字段与 `status`。

#### Scenario: 非法 code 被拒绝
- **WHEN** 管理员提交 code 为 `Luju_1`（含大写/下划线）的区域
- **THEN** 创建被拒绝并提示格式要求

#### Scenario: code 不可修改
- **WHEN** 管理员尝试修改已存在区域的 `code`
- **THEN** 修改被拒绝，其余字段允许更新

### Requirement: 删除区域的挂接约束
系统 SHALL 拒绝删除仍被任何集群挂接的区域，并 SHALL 在拒绝信息中列出挂接的集群。

#### Scenario: 删除被挂接区域
- **WHEN** 管理员删除仍被集群挂接的区域 luju
- **THEN** 删除被拒绝，返回挂接该区域的集群列表
