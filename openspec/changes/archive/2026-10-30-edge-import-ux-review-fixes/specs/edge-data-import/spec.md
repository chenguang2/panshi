# edge-data-import Delta

## MODIFIED Requirements

### Requirement: 连接测试

系统 SHALL 验证与 Edge 节点的 Admin API 连通性，并在导入前展示节点基本信息。连通性探测 SHALL 不阻塞事件循环。各类配置数据的探测 SHALL 并行执行（总耗时接近最慢单请求而非串行累加）。

#### Scenario: 连接成功
- **WHEN** 用户输入 Edge 节点 IP、端口和 API Key 并点击"测试连接"
- **THEN** 系统 SHALL 并行调用 Edge 节点 Admin API 验证连通性并统计各类配置数量
- **AND** 系统 SHALL 返回节点版本号、已安装插件数量、路由数量、上游数量和 SSL 证书数量
- **AND** 前端 SHALL 显示连接成功状态和节点概要信息

#### Scenario: 连接测试过程反馈
- **WHEN** 用户点击"测试连接"后等待响应期间
- **THEN** 前端 SHALL 在按钮 loading 态之外显示过程提示，说明正在连接节点并统计配置数据、耗时视节点网络而定
- **AND** 等待期间 SHALL NOT 出现无任何反馈的静默状态

#### Scenario: 连接失败
- **WHEN** Edge 节点不可达、端口错误或 API Key 无效
- **THEN** 系统 SHALL 返回明确的错误信息（超时/拒绝连接/认证失败）
- **AND** 前端 SHALL 显示错误信息并允许用户修改参数后重新测试

#### Scenario: 阻塞 IO 卸载工作线程

- **WHEN** 异步端点执行同步的 Edge 数据抓取或连接探测（httpx 串行请求）
- **THEN** 同步调用 SHALL 经 `asyncio.to_thread` 卸载，事件循环 SHALL 保持可响应
- **AND** 预览/执行路径的长外部 IO 前 SHALL 先 `db.commit()` 结束读事务并落审计（防写锁横跨 IO 期的假 401）

### Requirement: 导入执行

系统 SHALL 在用户确认后执行数据导入，并反馈导入结果。执行前 SHALL 展示摘要确认弹窗（导入类别与数量、冲突跳过语义）。

#### Scenario: 导入前摘要确认
- **WHEN** 用户在预览步骤点击「确认导入」
- **THEN** 系统 SHALL 弹出确认弹窗，展示将导入的类别与数量摘要，并说明「冲突项将自动跳过」
- **AND** 用户确认后方执行导入

#### Scenario: 成功导入
- **WHEN** 用户确认导入所选数据
- **THEN** 系统 SHALL 按顺序导入：上游 → 路由 → 插件配置 → 全局规则 → SSL 证书
- **AND** 系统 SHALL 为 Edge 节点创建或更新 `ps_node` 记录并关联到所选集群
- **AND** 系统 SHALL 写入 `ps_import_log` 记录本次导入详情
- **AND** 前端 SHALL 显示导入成功，展示各类别导入数量

#### Scenario: 导入结果展示
- **WHEN** 导入完成
- **THEN** 前端 SHALL 显示汇总结果：
  - 成功导入：上游 N 个、路由 N 条、插件配置 N 个、全局规则 N 个、四层代理 N 个、SSL 证书 N 个
  - 已跳过：总数及分类明细（上游跳过 N 个……）
  - 查看导入日志的链接

## ADDED Requirements

### Requirement: 向导步骤引导与状态保持

导入向导 SHALL 在按钮不可用时说明前置条件：「下一步」在连接测试未完成时禁用并以 tooltip 说明「请先完成连接测试」。「上一步」返回第一步 SHALL 保留已选集群（仅清除节点选择与连接测试态）；「取消」SHALL 经确认弹窗提示将丢弃已选配置与预览数据后方执行。

#### Scenario: 下一步禁用说明
- **WHEN** 用户未完成连接测试时悬停或查看「下一步」按钮
- **THEN** 按钮 SHALL 呈禁用态且 tooltip 说明「请先完成连接测试」

#### Scenario: 上一步保留集群
- **WHEN** 用户从第二步点「上一步」回到第一步
- **THEN** 所属集群 SHALL 保持已选状态，节点选择与连接测试态重置（可直接重选节点重测）

#### Scenario: 取消确认
- **WHEN** 用户在第二步点「取消」
- **THEN** 系统 SHALL 弹出确认提示（取消将丢弃已选配置与预览数据），确认后方清空并回第一步

### Requirement: Admin Key 语义说明

节点 Admin Key 输入框 SHALL 说明可空语义：留空时系统使用节点已配置的 Admin Key。

#### Scenario: 留空回退说明
- **WHEN** Admin Key 输入框展示时
- **THEN** placeholder 或邻近提示 SHALL 包含「留空则使用节点已配置的 Key」语义

### Requirement: 预览交互

预览步骤 SHALL 默认展开有数据的 section 详情（0 项的 section 保持收起）；SHALL 提供「全选 / 全不选」快捷项作用于全部 section 勾选；数据为 0 的 section SHALL 折叠为单行提示而非空表格卡片。

#### Scenario: 默认展开有数据 section
- **WHEN** 用户进入预览步骤且上游有 12 个、四层代理 0 个
- **THEN** 上游 section 默认展开详情，四层代理 section 默认收起

#### Scenario: 全选快捷项
- **WHEN** 用户点击「全选」
- **THEN** 全部 7 个 section 勾选；点击「全不选」全部取消

#### Scenario: 空 section 折叠
- **WHEN** 某类配置数据为 0 项
- **THEN** 该 section SHALL 显示单行提示（如「四层代理：0 个」），不渲染空表格
