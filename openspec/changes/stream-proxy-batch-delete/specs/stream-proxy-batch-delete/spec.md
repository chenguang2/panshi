# Stream Proxy Batch Delete

## ADDED Requirements

### Requirement: 批量管理模式

四层代理卡片列表页 SHALL 提供「批量管理」模式，支持勾选多张卡片并批量删除。

#### Scenario: 进入批量管理模式
- **WHEN** 用户点击页头「批量管理」按钮
- **THEN** 页面 SHALL 进入批量管理模式：每张卡片右上角 SHALL 浮现圆形勾选框，筛选栏 SHALL 浮现全选链接，底部 SHALL 浮现批量操作栏
- **WHEN** 用户再次点击「批量管理」或操作栏「退出批量管理」
- **THEN** 页面 SHALL 退出批量管理模式并清空所有选择

#### Scenario: 勾选卡片
- **WHEN** 用户在批量模式下点击卡片任意处或右上角勾选框
- **THEN** 该卡片 SHALL 切换选中状态（accent 边框高亮 + 勾选框显示 ✓）
- **THEN** 底部操作栏「已选择 N 个」计数 SHALL 实时更新
- **WHEN** 已选择 0 个
- **THEN** 「批量删除」按钮 SHALL 禁用

### Requirement: 全选联动

批量模式下 SHALL 支持全选当前分组与全选当前筛选结果，且为 toggle 语义。

#### Scenario: 全选当前分组
- **WHEN** 用户点击「全选当前分组」且当前分组内存在未选中的卡片
- **THEN** 当前分组下全部可见卡片 SHALL 被选中
- **WHEN** 当前分组内全部卡片已选中时再次点击
- **THEN** 当前分组下全部卡片 SHALL 被取消选中（toggle）
- **WHEN** 分组筛选为「全部分组」（`__all__`）
- **THEN** 「全选当前分组」SHALL NOT 显示（V9）

#### Scenario: 全选当前筛选结果
- **WHEN** 用户点击「全选当前筛选结果」且当前筛选/搜索/分组条件下存在未选中的卡片
- **THEN** 当前全部**已加载**卡片 SHALL 被选中（范围 = 当前页已加载数据，V7）
- **WHEN** 当前全部已加载卡片已选中时再次点击
- **THEN** 当前全部已加载卡片 SHALL 被取消选中（toggle）

#### Scenario: 筛选变化保留选择
- **WHEN** 用户已勾选部分卡片后更改搜索词/集群/分组筛选
- **THEN** 已选中的卡片 SHALL 按 id 保留，计数与确认弹窗 SHALL 基于原始代理列表（proxies 快照）解析，不受当前筛选视图影响（V8）

### Requirement: 批量删除与确认

批量模式下 SHALL 支持对选中的多个四层代理执行删除，确认弹窗聚合展示并复用删除进度反馈。

#### Scenario: 批量删除确认
- **WHEN** 用户点击「批量删除」且已选择 N 个代理
- **THEN** 确认弹窗 SHALL 列出全部 N 个将删除的代理（名称 + 协议/端口摘要，基于原始列表解析，V8）
- **THEN** 弹窗 SHALL 提供「同时从数据库删除」「同时删除 Edge 节点」选项与不可恢复警告
- **AND** SHALL NOT 要求输入名称确认（与集群删除不同）
- **AND** 勾选「删除 Edge 节点」时 SHALL NOT 提供逐节点选择——删除各集群**全部在线节点**上的配置（V1-A），弹窗文案 SHALL 明示
- **WHEN** 用户确认
- **THEN** SHALL 调用后端批量删除端点，展示进度弹窗并逐条反馈结果（复用 executeDeleteWithProgress）

#### Scenario: 删除完成清理
- **WHEN** 批量删除完成
- **THEN** 列表 SHALL 刷新，选择状态 SHALL 清空，页面 SHALL 退出批量管理模式
- **THEN** 部分失败时 SHALL 展示成功/失败逐条结果（partial 状态）

### Requirement: 后端批量删除端点

系统 SHALL 提供四层代理批量删除端点，支持跨集群一次性删除多个代理。

#### Scenario: 批量删除请求
- **WHEN** 前端发送 `DELETE /stream-proxies`，body 含 `proxy_ids`、`delete_db`、`delete_edge`、可选 `node_ids`
- **THEN** 系统 SHALL 按代理所属集群分组处理，逐条独立执行（复用单删逻辑），单条失败 SHALL NOT 阻塞其余
- **THEN** 返回 `{ message, results: [{proxy_id, name, status, results}] }`（`name` 为代理名称，对齐前端 nameField，V4）
- **THEN** 单条失败 SHALL 以 `status: "failed"` + `message` 标记于 results 条目（V5），不抛 HTTPException 中断整体
- **WHEN** 批量删除勾选「删除 Edge 节点」且未指定 `node_ids`
- **THEN** 系统 SHALL 删除各代理所属集群的**全部在线节点**上的配置（V1-A/V6）
- **WHEN** `proxy_ids` 为空
- **THEN** 系统 SHALL 返回 400
- **WHEN** `delete_db` 与 `delete_edge` 均未选择
- **THEN** 系统 SHALL 返回 400（与单删一致：请至少选择一项）

#### Scenario: 仅处理普通四层代理
- **WHEN** 用户批量删除的 `proxy_ids` 中包含 DNS 代理（`proxy_type != "normal"`）或不存在/类型不符的 id
- **THEN** 系统 SHALL 仅删除 `proxy_type == "normal"` 的记录（V2-A）
- **THEN** 非 normal/不存在的 id SHALL 标记为失败条目（`status: "failed"`），不删除，且 SHALL NOT 阻塞其余 normal 代理的删除
