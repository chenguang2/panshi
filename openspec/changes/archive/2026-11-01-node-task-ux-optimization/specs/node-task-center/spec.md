# node-task-ux-optimization — node-task-center Delta

## ADDED Requirements

### Requirement: 任务结果可归因

系统 SHALL 为每个失败节点子任务提供**中文失败归因**，不依赖 ansible 原始英文输出，也不区分 ansible 退出码（rc=0 的假成功与 rc≠0 的真实失败一律归类）。归因结果 SHALL 持久化到 `install_task_node.failure_reason`，并在 `stderr` 为空时回填 `stderr`。任务级 SHALL 提供 `failure_summary`（按归因聚合节点数），随任务列表与详情响应返回。

归类口径 SHALL 至少覆盖：节点不在 Ansible 主机清单、节点不可达/连接失败、SSH 认证失败、执行超时、磁盘空间不足、权限不足（sudo/root）；其余情况 SHALL 退化为「执行失败（返回码 N）」。系统 MUST NOT 存在 `failure_reason` 与 `stderr` 同时为空的失败子项。

#### Scenario: rc≠0 的真实失败也有中文归因
- **WHEN** 节点执行返回非零退出码且 ansible 输出含 `UNREACHABLE` / `Failed to connect` 标记
- **THEN** 该子任务 `failure_reason` SHALL 为中文归因（如「节点 192.168.0.14 无法连接，请检查网络与 SSH 服务（22 端口）」）
- **AND** 原 `stderr` 为空时 SHALL 以该归因回填，前端无需改动即可在 stderr 页签读到

#### Scenario: 未知失败不静默
- **WHEN** 节点执行失败且输出未命中任何已知标记
- **THEN** `failure_reason` SHALL 为「节点 {ip} 执行失败（返回码 {rc}），请查看日志详情」
- **AND** SHALL NOT 留空

#### Scenario: 任务级失败摘要聚合
- **WHEN** 一个任务下 3 台节点因「不在主机清单」失败、1 台因「连接超时」失败
- **THEN** 任务列表与详情的 `failure_summary` SHALL 为按节点数聚合的一句话（如「3 台节点不在 Ansible 主机清单；1 台 SSH 连接超时」）
- **AND** 成功任务该字段 SHALL 为空

#### Scenario: 进程重启中断写入原因
- **WHEN** 后端进程在任务 running 期间重启，重启恢复将该任务标记为 failed
- **THEN** 该任务及未完成子项的 `failure_reason` SHALL 为「进程重启中断，任务未完成」
- **AND** 用户 SHALL 在列表直接看到该原因，无需展开日志

### Requirement: 任务统计一致性

任务主表的 `total_nodes`、`success_nodes`、`failed_nodes`、`skipped_nodes`、`cancelled_nodes` SHALL 始终由该任务的节点子项实际状态重算得出（创建后、执行收尾时、重试后各重算一次），MUST NOT 保留与子项不一致的历史值。`total_nodes` MUST 恒等于子项记录数。

#### Scenario: 统计与子项一致
- **WHEN** 任务终态，子项为 1 成功 + 3 失败
- **THEN** 响应中 `total_nodes=4`、`success_nodes=1`、`failed_nodes=3`
- **AND** 列表 SHALL NOT 出现「成功数 > 总数」等不可能组合

#### Scenario: 历史不一致数据回填
- **WHEN** 系统启动且存在主表统计与子项数不一致的历史任务
- **THEN** 迁移 SHALL 以子项实际状态回填主表统计（`total_nodes` 取子项数）
- **AND** 回填 SHALL 幂等（重复启动结果不变）

#### Scenario: 重试后统计重置
- **WHEN** 用户重试某任务的 2 台失败节点
- **THEN** 重试开始时该 2 台子项置为 pending，主任务统计 SHALL 随子项状态重算（不得累加上一次的结果）

### Requirement: 取消请求状态可见

取消操作 SHALL 具备持久化的「已请求取消」状态，使刷新页面或断线重连后用户仍能看到「取消中」。被取消的**运行中**子项 SHALL 记为 `cancelled`（计入 `cancelled_nodes`），**尚未开始**的子项 SHALL 记为 `skipped`。

#### Scenario: 取消请求落库
- **WHEN** 用户对运行中任务发起取消
- **THEN** 主任务 `cancel_requested_at` SHALL 被置位并在后续查询中可见
- **AND** SSE `task_update` 事件 SHALL 携带 `cancel_requested=true`
- **AND** 前端状态 SHALL 显示「取消中」而非「执行中」

#### Scenario: 取消后子项状态真实
- **WHEN** 取消生效
- **THEN** 被中断的节点子项状态 SHALL 为 `cancelled`，未开始的 SHALL 为 `skipped`
- **AND** `cancelled_nodes` SHALL 等于实际 `cancelled` 子项数（不得恒为 0）

#### Scenario: 取消幂等
- **WHEN** 用户对同一任务重复发起取消
- **THEN** 系统 SHALL NOT 报错，`cancel_requested_at` 保持首次置位时间

### Requirement: 任务中心列表信息架构

全局任务列表 SHALL 让用户在不打开详情的情况下判断「哪个集群、谁发起、成没成、为什么没成、要不要重试」。

#### Scenario: 跨集群列表显示集群与发起人
- **WHEN** 用户查看全局任务列表（跨集群）
- **THEN** 每行 SHALL 显示集群名称与发起人（历史任务无记录时显示占位符）
- **AND** 新建任务 SHALL 记录发起用户 id 与用户名

#### Scenario: 结果单元格合并呈现
- **WHEN** 任务为部分成功或失败
- **THEN** 列表 SHALL 在单一「结果」单元格内呈现状态 chip、成功/失败/跳过计数与分段进度条
- **AND** SHALL 在第二行呈现 `failure_summary`（截断 + 悬浮完整）
- **AND** 失败任务的分段条 SHALL NOT 呈现为「空条」（失败段须可见）

#### Scenario: 搜索与筛选
- **WHEN** 用户输入关键字（任务号 / 节点 IP / 命令关键字）或选择集群、任务类型、状态、时间范围
- **THEN** 列表 SHALL 按条件过滤并返回匹配总数
- **AND** 关键字匹配 SHALL 至少覆盖任务 id 与子项 IP

#### Scenario: 空态与批量工具条
- **WHEN** 列表为空
- **THEN** SHALL 显示带主行动的引导文案（引导新建任务），而非通用「暂无数据」
- **WHEN** 用户勾选若干行
- **THEN** SHALL 出现批量工具条（重试 / 删除 / 导出）

### Requirement: 任务详情呈现

任务详情 SHALL 按「结论 → 上下文 → 节点明细 → 参数 → 日志」的顺序组织，使用户首屏即获得「是否成功、为什么失败、下一步做什么」。

#### Scenario: 结论区置顶
- **WHEN** 用户打开一个部分成功任务的详情
- **THEN** 首屏 SHALL 显示状态、成功/失败/跳过计数、失败原因摘要与处理建议
- **AND** SHALL 提供主操作「重试 N 台失败节点」（N 为失败数，不可用时说明原因）

#### Scenario: 上下文信息完整
- **WHEN** 用户打开详情
- **THEN** SHALL 显示任务号、任务类型、所属集群、发起人、创建/开始/结束时间与耗时
- **AND** SHALL NOT 依赖返回列表页才能获得上述信息

#### Scenario: 参数可读
- **WHEN** 任务参数含 `cmd` / `security` / `timeout` 等键
- **THEN** SHALL 以中文标签的 key-value 形式展示，并提供复制入口
- **AND** 原始 JSON SHALL 收进可折叠区域，MUST NOT 作为首屏裸露内容

#### Scenario: 日志入口唯一
- **WHEN** 用户在节点明细行查看日志
- **THEN** 每行 SHALL 只有一个「查看日志」入口（不得并列「展开」与「完整日志」两个等价按钮）
- **AND** 日志面板 SHALL 提供 stdout / stderr / 命令 / 实时四个视图、下载与整任务导出

#### Scenario: 无日志类型明确说明
- **WHEN** 任务类型不产生流式日志（状态查询 / 启动 / 停止 / 重载等）且用户打开日志视图
- **THEN** SHALL 说明「该任务类型不产生实时日志」并指向 stdout/命令视图，而非仅显示「无输出」

### Requirement: 创建任务表单可用性

创建任务表单 SHALL 明确标出必填字段、按任务类型分组选项、并在上下文变化时保持选项有效。

#### Scenario: 必填标识与逐字段校验
- **WHEN** 用户打开创建任务弹窗
- **THEN** 必填字段 SHALL 带 `*` 标识
- **AND** 提交缺项时 SHALL 逐字段行内报错（不得以一句合并提示覆盖多个字段）
- **AND** 提交按钮禁用时 SHALL 说明缺哪一项

#### Scenario: 切换集群后重新加载类型相关选项
- **WHEN** 用户已选任务类型为「安装 OpenResty」或「升级 Edge(传包)」后切换集群
- **THEN** 安装包 / 版本包列表 SHALL 按新集群重新加载
- **AND** SHALL NOT 停留在空列表（当前缺陷：切换后恒空，需切走类型再切回）

#### Scenario: 节点可搜索且离线不可选
- **WHEN** 用户选择目标节点
- **THEN** SHALL 提供节点搜索（IP / 名称）
- **AND** 离线节点 SHALL 置灰不可选并标注「离线」
- **AND** SHALL 显示「已选 N / M 台」

#### Scenario: 执行策略可理解
- **WHEN** 任务类型为「命令执行」的命令模式
- **THEN** 黑名单 / 白名单 / 不限制 SHALL 带组标签与一句话说明其约束范围
- **AND** 帮助文案 SHALL 按当前任务类型切换（命令执行不得沿用安装类「从节点记录自动读取安装路径」文案）

### Requirement: 任务重试的前置条件与证据保留

重试 SHALL 仅在任务处于终态时允许，且 MUST NOT 销毁上一次执行的日志证据。

#### Scenario: 非终态任务拒绝重试
- **WHEN** 用户对 pending/running 任务发起重试
- **THEN** 系统 SHALL 返回 409 并提示「任务执行中，请先取消」

#### Scenario: 无效节点拒绝对策
- **WHEN** 请求体 `node_ids` 含不属于该任务的节点
- **THEN** 系统 SHALL 返回 400 并列出无效 id，MUST NOT 静默无操作

#### Scenario: 保留上次执行日志
- **WHEN** 用户重试失败节点
- **THEN** 该节点日志文件 SHALL 保留上次内容，并在重试开始时追加「第 N 次执行」分隔头
- **AND** `rc`/`stdout`/`stderr`/`failure_reason` SHALL 重置为本次尝试的值
- **AND** 前端确认弹窗 SHALL 列出将重试的节点数量并说明日志保留策略
