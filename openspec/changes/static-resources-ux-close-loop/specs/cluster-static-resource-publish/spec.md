# cluster-static-resource-publish Delta

## MODIFIED Requirements

### Requirement: 发布到 Edge 节点

用户 SHALL 能够将静态资源 zip 文件发布到所选 Edge 节点。发布 SHALL 将当前已上传版本分发到所选节点并覆盖节点文件，SHALL NOT 产生新版本号（版本号在上传时递增）。

#### Scenario: 选择节点并发布
- **WHEN** 用户点击发布按钮
- **THEN** 弹出目标节点选择弹窗（类似插件组发布），默认勾选所有在线节点
- **AND** 弹窗标题 SHALL 含资源名称（「发布静态资源「{name}」」），独立页与 Tab 一致
- **WHEN** 用户确认发布
- **THEN** 系统遍历所选节点，调用 `PUT /edge/panshi/admin_static_resources` 发送 zip 文件
- **AND** 弹窗展示实时进度日志和每节点同步状态
- **AND** 每次 Edge 节点 API 调用记录到 `logs/edge/static_resource.log` 文件中

#### Scenario: 发布成功
- **WHEN** 所有节点同步成功
- **THEN** 进度条显示绿色成功
- **AND** 日志记录 Status: SUCCESS

#### Scenario: 部分节点失败
- **WHEN** 部分节点同步失败
- **THEN** 进度条显示红色异常，展示失败节点及其错误信息
- **AND** 记录当前版本的发布结果到数据库
- **AND** 日志记录 Status: FAILED 并包含错误信息

#### Scenario: 发布日志状态中文化
- **WHEN** 发布/删除进度弹窗输出逐节点结果
- **THEN** 节点状态 SHALL 经共享 `resultStatusLabel` 渲染为中文（「成功/失败」），SHALL NOT 输出裸 `success/failed` 英文状态
- **AND** 独立页与 Tab 两入口 SHALL 一致（共享映射，禁止逐入口复制实现）

#### Scenario: 发布结果持久化
- **WHEN** 一轮发布结束（全成功 / 部分失败 / 全失败）
- **THEN** 系统 SHALL 将最近一次发布结果持久化到 `static_resources` 行：`last_publish_ok`（Boolean nullable，null=从未发布）、`last_publish_detail`（JSON：total/success/failed/failed_nodes）、`last_published_at`
- **AND** 两个列表端点（独立页 / Tab）SHALL 返回 `last_publish_ok`、`last_published_at`、`route_exists`

#### Scenario: 发布执行不持有数据库事务
- **WHEN** 发布端点执行逐节点分发 IO
- **THEN** 数据库事务 SHALL 已在节点循环开始前提交释放（IO 执行瞬间 `db.in_transaction()` SHALL 为 false）
- **AND** 发布结果 SHALL 在循环结束后的独立事务中落库

#### Scenario: 失败节点重发入口
- **WHEN** 最近一次发布存在失败节点
- **THEN** 卡片 SHALL 提供「重发失败节点」操作，以失败节点预选打开发布确认弹窗
