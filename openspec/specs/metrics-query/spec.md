# metrics-query Specification

## Purpose
TBD - created by archiving change metrics-query-ux-optimization. Update Purpose after archive.

## Requirements

### Requirement: Metric selector

指标查询页（`/metrics`）的指标选择器 SHALL 按域分组渲染可选指标（组：业务流量与连接 / HTTP 延迟与带宽 / 插件 / 共享字典 / 采集器与节点 / 其他），SHALL 支持按「指标名 — 中文标签」搜索；选项 = 数据源当前存在的指标（`GET /metrics/names`），未匹配分组映射前缀的指标 SHALL 落入「其他」组（可见、不丢失）。默认选中指标 SHALL 为 `edge_http_requests_total`（不在清单时回退首项），SHALL NOT 取字典序第一个。选中指标 SHALL 同步进 URL query（`?metric=`，非法值回退默认）。

#### Scenario: 首访默认指标
- **WHEN** 用户首次进入 `/metrics` 且指标清单加载成功
- **THEN** 默认选中 `edge_http_requests_total` 并立即出图，SHALL NOT 出现「首访即无意义指标」
- **AND** 指标清单加载失败时选择器保持可重试（进页重试），不阻塞页面其余区块

#### Scenario: 分组与搜索
- **WHEN** 用户展开指标下拉
- **THEN** 选项 SHALL 按域分组展示（组标题可见），组内保持稳定排序
- **AND** 输入关键词 SHALL 按「指标名 — 中文标签」过滤（如输入「延迟」或「latency」均能命中）

### Requirement: Query result card states

查询结果卡 SHALL 接入三态机：**loading 骨架 > 归因错误 + 重试 > 语境化空态 > 数据**。loading 期间 SHALL 显示骨架占位，SHALL NOT 显示「当前无数据」（状态误报）。错误 SHALL 按原因归因：数据源不可用 → 「数据源不可用，无法读取指标」（与横幅同源）；其余 → 「加载失败」＋ 重试按钮（重发当前查询）。空态按归因：数据源正常但无样本 → 「该指标在所选时间范围内无上报数据」。

#### Scenario: 首访加载期
- **WHEN** 页面加载中（指标清单/时序数据任一未完成）
- **THEN** 结果卡 SHALL 显示骨架占位，SHALL NOT 显示「当前无数据」

#### Scenario: 加载失败
- **WHEN** 时序查询失败（数据源正常）
- **THEN** 结果卡 SHALL 显示「加载失败」＋ 重试按钮，点击重试 SHALL 仅重发当前查询

#### Scenario: 数据源不可用
- **WHEN** summary 判定 source_ok=false
- **THEN** 结果卡空态 SHALL 归因为「数据源不可用，无法读取指标」而非「无上报数据」

### Requirement: Query result header

结果卡头部 SHALL 展示 `{指标中文标签} {最近有效桶读数}{单位}` 与口径标注「近 {range} · 间隔 {interval} · 更新于 {HH:mm:ss}」。读数口径：gauge 取桶内最新读数（last）、counter 取桶均速率（avg，单位随点内 unit）；无有效桶时头部显示 `--`。

#### Scenario: 头部口径可读
- **WHEN** 查询成功返回
- **THEN** 头部 SHALL 展示大数、单位与口径标注三要素（值 / 近 {range} · 间隔 {interval} / 更新于 {HH:mm:ss}）
- **AND** 计数器指标的速率语义 SHALL 经单位后缀（如 `/s`）显式呈现，SHALL NOT 与「计数」类标签产生歧义

### Requirement: Refresh orchestration

查询页 SHALL 与总览页共用同一刷新编排约定：刷新间隔可选（60s 默认 / 120s / 300s）、自动/手动开关、立即刷新按钮、「更新于 HH:mm:ss」完成时间戳；页面隐藏时自动刷新 SHALL 暂停。进行中的请求 SHALL NOT 因切换间隔/开关被中断（单飞守卫保留）。

#### Scenario: 手动刷新
- **WHEN** 用户点击「立即刷新」
- **THEN** 当前查询与汇总 SHALL 立即重发，完成后更新「更新于」时间戳

#### Scenario: 自动刷新开关
- **WHEN** 用户关闭自动开关
- **THEN** 定时刷新 SHALL 停止，手动刷新仍可用

### Requirement: Cluster and node filter integration

查询页 SHALL 提供与总览页同款的集群/节点两级筛选（联动逻辑抽共享 composable，SHALL NOT 复制实现），筛选 SHALL 透传至时序查询（`Attributes['ip'] IN` 过滤，端点既有能力）；筛选状态 SHALL 进 URL query（`?cluster=&node=`，与总览页同规范）。汇总卡 SHALL 保持「全站 · 近 5 分钟」口径并显式标注（SHALL NOT 随筛选静默变化）。

#### Scenario: 筛选生效范围
- **WHEN** 用户选定集群/节点
- **THEN** 查询结果卡（图/头部）SHALL 仅反映筛选集合内节点的数据
- **AND** 汇总卡 SHALL 保持全站口径且口径标注可见（「全站 · 近 5 分钟」）

#### Scenario: 筛选切换重置
- **WHEN** 用户切换集群
- **THEN** 节点筛选 SHALL 重置为「全部节点」（两级联动状态机与总览页一致）

### Requirement: Business summary cards

业务汇总卡 SHALL 固定渲染三卡（总请求数（近5分钟）/ Nginx 活跃连接数（当前）/ 指标采集错误数（近5分钟）），数据缺失显示 `--`，SHALL NOT 因数据缺失隐藏卡片造成布局跳动。Nginx 连接数卡 SHALL 保留读/写/等待/新建细分行。三卡 SHALL 支持点击联动查询（设对应指标与时间范围），hover SHALL 提示「点击查看趋势」。

#### Scenario: 数据缺失稳定性
- **WHEN** summary 响应缺少某个业务指标
- **THEN** 对应卡 SHALL 仍渲染并显示 `--`，三卡布局不变

#### Scenario: 点击联动
- **WHEN** 用户点击「总请求数」汇总卡
- **THEN** 指标选择器 SHALL 切换为 `edge_http_requests_total` 并触发查询（时间范围不变）
