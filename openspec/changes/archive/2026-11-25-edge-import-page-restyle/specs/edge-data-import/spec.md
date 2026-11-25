# edge-data-import Delta

## MODIFIED Requirements

### Requirement: 连接测试

<!-- 2026-11-25 edge-import-page-restyle：连接反馈视觉契约升级（成功横幅 + 计数 chips / 失败横幅）；
     探测并行、过程反馈、阻塞 IO 卸载等既有契约原文保留 -->

系统 SHALL 验证与 Edge 节点的 Admin API 连通性，并在导入前展示节点基本信息。连通性探测 SHALL 不阻塞事件循环。各类配置数据的探测 SHALL 并行执行（总耗时接近最慢单请求而非串行累加）。连接反馈 SHALL 采用全站 token 横幅语言：成功态为绿横幅，节点概要（节点地址与路径标注、版本、响应时间）之下以 mono 计数 chips 行呈现各类配置数量；失败态为 danger 横幅呈现明确错误信息。

#### Scenario: 连接成功
- **WHEN** 用户输入 Edge 节点 IP、端口和 API Key 并点击"测试连接"
- **THEN** 系统 SHALL 并行调用 Edge 节点 Admin API 验证连通性并统计各类配置数量
- **AND** 系统 SHALL 返回节点版本号、已安装插件数量、路由数量、上游数量和 SSL 证书数量
- **AND** 前端 SHALL 以绿横幅显示连接成功状态，节点概要信息（节点/版本/响应时间）与各类配置计数 chips 同卡呈现

#### Scenario: 连接测试过程反馈
- **WHEN** 用户点击"测试连接"后等待响应期间
- **THEN** 前端 SHALL 在按钮 loading 态之外显示过程提示，说明正在连接节点并统计配置数据、耗时视节点网络而定
- **AND** 等待期间 SHALL NOT 出现无任何反馈的静默状态

#### Scenario: 连接失败
- **WHEN** Edge 节点不可达、端口错误或 API Key 无效
- **THEN** 系统 SHALL 返回明确的错误信息（超时/拒绝连接/认证失败）
- **AND** 前端 SHALL 以 danger 横幅显示错误信息并允许用户修改参数后重新测试

#### Scenario: 阻塞 IO 卸载工作线程

- **WHEN** 异步端点执行同步的 Edge 数据抓取或连接探测（httpx 串行请求）
- **THEN** 同步调用 SHALL 经 `asyncio.to_thread` 卸载，事件循环 SHALL 保持可响应
- **AND** 预览/执行路径的长外部 IO 前 SHALL 先 `db.commit()` 结束读事务并落审计（防写锁横跨 IO 期的假 401）

## ADDED Requirements

### Requirement: 向导页解剖

导入页 SHALL 采用三步向导形态（选择节点 / 选择配置 / 预览导入）：自绘步条（数字圆点 + 贯穿线；完成态 accent 实心勾、活动态 accent 线框、待办态 muted），步条 MUST NOT 可交互（步进 SHALL 仅经各步动作按钮）。Step 1 SHALL 以可选类型卡网格呈现 7 类配置（勾选角标 + 图标 + 名称；选中态 accent 描边淡底）。Step 2 SHALL 将三类提示（部分获取失败/插件识别/冲突提示）统一为 warn 横幅语言，冲突详情以可折叠 grid-table 呈现；导入项 SHALL 为 section 卡（勾选框 + 计数标题 + 预览详情切换；空数据单行降噪）。导入完成结果 SHALL 呈现为 token 绿框计数明细 + 冲突跳过分项，并提供「继续导入」（重置向导）与「查看集群详情」（跳转）入口；页面 SHALL NOT 使用硬编码色值。

#### Scenario: 步条形态与流转
- **WHEN** 用户在各步之间流转
- **THEN** 步条 SHALL 按 `currentStep` 呈现完成/活动/待办三态
- **AND** 步进 SHALL 仅经「上一步/下一步」动作按钮触发，步条本身 MUST NOT 可点击跳步

#### Scenario: 配置类型可选卡
- **WHEN** 用户进入选择配置步
- **THEN** SHALL 呈现 7 类配置可选卡网格（点击切换勾选，选中态 accent 描边淡底）
- **AND** 「下一步 — 预览」SHALL 在无勾选时禁用（既有语义）

#### Scenario: 预览警告与 section 卡
- **WHEN** 用户进入预览导入步
- **THEN** 获取失败/插件识别/冲突提示 SHALL 以统一 warn 横幅呈现（有则显示）
- **AND** 每类导入项 SHALL 为 section 卡：勾选框 + 计数标题 + 预览详情切换按钮；空数据 SHALL 单行提示「0 N（节点上无此类配置）」

#### Scenario: 导入完成结果
- **WHEN** 导入执行完成
- **THEN** 结果 SHALL 以 token 绿框呈现各类导入计数明细，冲突跳过项 SHALL 分项列出
- **AND** SHALL 提供「继续导入」与「查看集群详情」入口
