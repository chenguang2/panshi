# relay-region-registry Specification

## Purpose

跨中心区域（局）注册表：以 `relay_gateways` 表为唯一事实源，存储各局的网关 HTTP 腿地址与 SSH 跳板，供集群挂接区域后解析三条管理通道的寻址路径；提供区域启停、`features.yaml` 全局总开关、区域连通性测试与 code/删除约束。中继通道寻址（relay-channel-routing）与网关配置渲染下发（relay-config-push）均以本注册表为数据源。

## Requirements

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
系统 SHALL 提供 `features.yaml` 的 `features.relay_gateway` 作为全局总开关（显式 opt-in，默认 `false`，不沿用 features.yaml 的"未列出即启用"约定）。关闭时：① 所有区域一律按直连路径执行，无论区域配置如何；② 中继区域管理面整体不可用——侧边栏菜单项隐藏（条目 `feature` 门）、前端 `/relay-gateways` 路由不注册（`featureRouteMap` 动态注册）、后端 `/relay` 全部端点返回 404「中继网关功能未启用」（`_require_relay_feature` 端点级 router dependency，请求期实时检查）。权限依赖 SHALL 先于总闸解析：无 `relay_gateway` 权限者得 403，404 不泄露模块存在性。该开关经 `app.core.features` 的 mtime 热加载读取，执行路径与上述管理面三层 SHALL 全部改完即时生效、无需重启。

#### Scenario: 一键回退
- **WHEN** `features.yaml` 中 `relay_gateway: false`
- **THEN** 所有节点通道寻址按现状直连路径执行，行为与本变更合入前一致

#### Scenario: 开关热生效
- **WHEN** 管理员将 `features.yaml` 的 `relay_gateway` 由 `false` 改为 `true`
- **THEN** 无需重启后端，后续寻址即按区域网关路径（HTTP `X-Edge-Target` / SSH `-J`）执行

#### Scenario: 关闭时管理面不可用
- **WHEN** `features.yaml` 中 `relay_gateway: false`（不重启进程）
- **THEN** 侧边栏「中继区域管理」菜单项隐藏、`/relay-gateways` 路由不注册（直达 URL 不可达）、持 `relay_gateway` 权限者调用 `/relay` 端点得 404「中继网关功能未启用」

#### Scenario: 无权限者先于总闸得 403
- **WHEN** 用户无 `relay_gateway` 权限且总闸关闭，请求 `/relay` 端点
- **THEN** 返回 403（权限依赖先解析），不以 404 泄露模块存在性判定

### Requirement: 区域连通性测试
设置页 SHALL 提供单区域连通性测试动作与全区域一键体检动作，按区域路由依次探测：网关 HTTP 腿可达、SSH 跳板可达。测试与体检结果 SHALL 以持久结果弹窗呈现（分段逐条 + 失败原因 + 节点明细，可复制），并 SHALL 更新区域列表上的健康状态列（最近一次结果 + 体检时间）；结果不得仅以短暂 toast 承载。

#### Scenario: 区域测试通过
- **WHEN** 管理员对 luju 区域执行连通性测试且两腿均可达
- **THEN** 返回分段成功结果与耗时，结果弹窗逐段展示 ✓ 与耗时，该行健康态显示「✓ 正常」与体检时间

#### Scenario: 区域测试失败
- **WHEN** 区域测试中某一腿不可达
- **THEN** 返回标明失败段的分段结果，不中断其他段的探测；结果弹窗逐段展示失败原因，该行健康态显示首失败段摘要（tooltip 展示全部分段）

#### Scenario: 全量体检
- **WHEN** 管理员点击「全量体检」（不指定区域）
- **THEN** 系统并发探测全部区域（复用既有 `check_all`），结果弹窗按区域分组展示，各区域行健康态与体检时间逐一更新

#### Scenario: 体检期间操作不中断
- **WHEN** 体检弹窗被关闭（探测仍在进行）
- **THEN** 探测不中断，完成后健康状态列仍更新，终态以一行 message 提示

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

### Requirement: 区域表单字段格式校验
系统 SHALL 在前端提交前与后端写入前对区域路由字段做格式硬校验（拒绝提交/写入）：`http_base_url` SHALL 匹配 `http(s)://host[:port]`（不含路径）；`ssh_jump` SHALL 匹配 `user@host[:port]`；`openresty_prefix` SHALL 为以 `/` 开头的绝对路径。校验失败 SHALL 以 inline 错误文案（前端）与 400（后端）呈现，文案含格式示例。首尾空白 SHALL 先剥离再校验（既有 strip 行为保留）。

#### Scenario: HTTP 腿缺协议被拒绝
- **WHEN** 管理员提交 http_base_url 为 `10.10.1.1:8443`（漏 `http://`）
- **THEN** 前端提交被拦截并提示格式要求（含示例）；绕过前端直调 API 得 400

#### Scenario: SSH 跳板格式错误被拒绝
- **WHEN** 管理员提交 ssh_jump 为 `10.10.1.1:22`（缺账号）或 `tunnel@10.10.1.1`（允许，端口可省）
- **THEN** 前者被拦截并提示「账号@主机[:端口]」格式；后者通过

#### Scenario: 展示名缺失 inline 提示
- **WHEN** 管理员未填展示名即提交
- **THEN** 表单在展示名字段下方 inline 提示（不再使用全局 toast）

### Requirement: 区域操作层级与健康状态展示
设置页 SHALL 将高频操作（编辑、连通性测试、下发配置）以行内按钮直达，低频与高风险操作（初始化网关、配置跳板转发、查看配置、启用/禁用、删除）SHALL 收纳进「更多」下拉（删除红色置底）；状态列 SHALL 同时展示启用状态、清单缺组标记（既有）与健康状态（最近一次体检结果 + 时间）；执行流式操作（初始化/下发/跳板）期间该行 SHALL 整体禁用，非流式操作 SHALL 不被其他区域的执行流禁用。

#### Scenario: 低频操作收纳
- **WHEN** 管理员查看区域行操作
- **THEN** 行内可见编辑/连通性测试/下发配置三项，其余操作在「更多」下拉内且删除为红色置底项

#### Scenario: 健康状态持久展示
- **WHEN** 某区域完成一次体检（无论通过与否）
- **THEN** 该行状态列显示健康态摘要与体检时间，页面刷新前持续可见

#### Scenario: 执行中的行级禁用
- **WHEN** 区域 A 正在执行下发配置（流式操作）
- **THEN** 区域 A 行全部操作禁用（按钮文案带进度）；区域 B 的编辑/测试/预览/删除/启停仍可用，但 B 的流式操作（初始化/下发/跳板）因执行抽屉单流约束而禁用
