# autostart-ux-review-fixes 变更规格 — 自启动管理域增量

## ADDED Requirements

### Requirement: 批量自启动操作

系统 SHALL 支持对多选节点批量执行启用、禁用与状态查询：表格提供节点多选，工具栏提供批量入口；批量启用/禁用 SHALL 在单次批量流程内输入一次 root 凭据并逐节点复用（凭据不落库、不跨批量流程持久化）；批量执行 SHALL 逐节点串行进行并提供进度（已完成 n/总 N）与逐节点结果汇总（状态、rc、失败原因），中断（关闭面板）SHALL 停止发起剩余节点且已完成节点不回滚。

#### Scenario: 批量选择与入口
- **WHEN** 用户在表格勾选若干节点（或未勾选时对当前筛选结果全量）
- **THEN** 工具栏 SHALL 展示批量启用 / 批量禁用 / 批量查询状态入口，并显示影响节点数

#### Scenario: 批量凭据单次输入
- **WHEN** 用户发起批量启用或批量禁用
- **THEN** 系统 SHALL 展示共享凭据抽屉（root 账号密码输入一次），明示「密码仅用于本次批量操作，不保存」
- **AND** 批量流程内逐节点复用该凭据，MUST NOT 要求逐节点重复输入
- **AND** 凭据 SHALL NOT 写库或写日志明文（与单节点操作同约束）

#### Scenario: 批量执行进度与汇总
- **WHEN** 批量操作执行中
- **THEN** 系统 SHALL 展示进度（已完成 n/总 N）与逐节点结果汇总（每节点成功/失败、rc、失败原因归类）
- **AND** 单节点失败 SHALL NOT 中断其余节点

#### Scenario: 批量取消
- **WHEN** 用户在批量执行中关闭结果面板
- **THEN** 系统 SHALL 停止发起剩余节点，已完成节点结果保持
- **AND** 汇总 SHALL 如实标注「剩余节点未执行」

### Requirement: 危险操作风险提示

启用与禁用自启动的抽屉 SHALL 在表单顶部说明该操作的实际效果与后果：禁用 SHALL 明示「节点重启时 Edge 不会自动启动，需人工处理；服务文件保留可随时重新启用」；启用 SHALL 明示「将写入并覆盖 /etc/systemd/system/edge.service，并执行 daemon-reload 与 enable」。批量禁用 SHALL 额外显示影响节点数。

#### Scenario: 禁用风险说明
- **WHEN** 用户打开禁用自启动抽屉
- **THEN** SHALL 展示禁用后果说明（重启后 Edge 不自动拉起、服务文件保留）
- **AND** 确认按钮 SHALL 为危险色并明确「确认禁用」

#### Scenario: 启用覆盖说明
- **WHEN** 用户打开启用自启动抽屉
- **THEN** SHALL 展示写入与覆盖 /etc/systemd/system/edge.service 的说明

#### Scenario: 批量禁用强化提示
- **WHEN** 用户发起批量禁用
- **THEN** 凭据抽屉 SHALL 展示与单节点一致的禁用后果说明并显示「将对 N 台节点禁用自启动」

### Requirement: 不可操作节点预检

页面 SHALL 在发起操作前识别不可操作的节点并就地标注：节点不在 ansible 主机清单时 SHALL 禁用其启用/禁用/查询操作并说明原因（「节点不在主机清单，无法下发」）；节点 Edge 目录为空时 SHALL 禁用操作并说明；启用/禁用抽屉中运行用户无法从主机清单取得而回退为平台进程用户时，SHALL 在该字段下警示「与 Edge 实际运行用户不符将导致服务无法正常启动」。

#### Scenario: 不在清单的节点禁用操作
- **GIVEN** 某节点 IP 不在 ansible 主机清单中
- **WHEN** 用户查看节点列表
- **THEN** 该节点操作按钮 SHALL 呈禁用态并提示原因
- **MUST NOT** 等到填写 root 密码提交后才返回 400

#### Scenario: Edge 目录为空
- **GIVEN** 某节点 Edge 目录为空
- **WHEN** 用户查看节点列表
- **THEN** 该节点操作按钮 SHALL 呈禁用态并提示「节点未配置 Edge 目录」

#### Scenario: 运行用户兜底警示
- **WHEN** 启用/禁用抽屉中运行用户为平台进程用户兜底值（未能从清单取得）
- **THEN** 该字段下 SHALL 展示警示说明

### Requirement: 执行结果反馈

自启动操作的结果反馈 SHALL 为完成态：完成后进度区 SHALL 展示「已完成，用时 N 秒」（MUST NOT 停留在「等待中」类进行中文案）；返回码无值时 SHALL NOT 渲染空 rc 行；操作失败时 SHALL 按原因归类提示（root 认证失败 / 无法连接节点 / 其他），并保留执行日志入口。

#### Scenario: 完成态不再显示进行中文案
- **WHEN** 任一自启动操作执行完成（无论成败）
- **THEN** 进度区 SHALL 显示完成与耗时，MUST NOT 显示「等待中...」

#### Scenario: 失败原因归类
- **WHEN** 启用/禁用因 root 密码错误失败
- **THEN** 反馈 SHALL 说明「root 认证失败：请核对 root 账号密码」而非仅「操作失败」

## MODIFIED Requirements

### Requirement: 自启动管理页面

系统 SHALL 提供独立的自启动管理页面（与工具箱平行的菜单），列出集群下的 Edge 节点，并支持对每个节点执行自启动的启用、禁用与状态查询。表格 SHALL 遵循全站列表标准（分页、`#` 序号列），并提供集群筛选、IP 搜索与自启动状态筛选；操作按钮 SHALL 有层级（禁用为危险操作样式，启用不作主色强调）；页面 SHALL 提供「操作日志」入口跳转审计查询页。

#### Scenario: 展示节点列表
- **WHEN** 用户打开自启动管理页面
- **THEN** 系统 SHALL 以分页表格列出集群及其节点（`#` 序号、集群、节点 IP、Edge 目录、自启动状态）
- **AND** 提供「全部集群」筛选、IP 搜索框与自启动状态筛选
- **AND** 每个节点 SHALL 提供"启用自启动"、"禁用自启动"、"查询状态"三个操作

#### Scenario: 查询状态无需 root
- **WHEN** 用户对节点执行"查询状态"
- **THEN** 系统 SHALL 默认以节点现有非 root 连接执行 `systemctl is-enabled`，无需提供 root 凭据
- **AND** 用户 SHALL 可显式选择「使用 root 查询」并提供 root 凭据

#### Scenario: 查询抽屉字段收敛
- **WHEN** 用户打开查询状态抽屉
- **THEN** 抽屉 SHALL 仅展示节点信息与查询方式（及 root 模式凭据）
- **MUST NOT** 展示查询不使用的「Edge 目录」「运行用户」字段

#### Scenario: 状态五态与未查询可区分
- **WHEN** 用户查看自启动状态列
- **THEN** 真实态（已启用/已禁用/未配置）与失败态（查询受限/查询失败）及「未查询」SHALL 有可区分的标签与配色
- **AND** 「查询受限」（无 systemctl 读取权限）MUST NOT 使用与节点异常相同的警示红色
- **AND** 「未查询」（库中无记录）MUST NOT 显示为「未知」

#### Scenario: 操作日志入口
- **WHEN** 用户点击页头「操作日志」
- **THEN** SHALL 跳转审计查询页（本模块操作记录可追溯）
