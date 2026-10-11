# node-management Delta

## MODIFIED Requirements

### Requirement: 搜索节点

页面 SHALL 提供搜索输入框，仅支持按 IP 地址搜索节点（Node 模型无 name 列）。

#### Scenario: 按IP搜索
- **WHEN** 用户在搜索框输入 IP 地址
- **THEN** 系统筛选出 IP 匹配的节点

#### Scenario: 搜索占位文案如实
- **WHEN** 独立节点管理页渲染搜索输入框
- **THEN** 占位文案 SHALL 为「搜索 IP...」（不含「名称」）

#### Scenario: Tab 搜索字段不含名称
- **WHEN** 统一管理集群节点 Tab 渲染搜索字段下拉
- **THEN** 选项 SHALL NOT 包含「名称」

#### Scenario: 后端搜索字段声明收敛
- **WHEN** 处理 `GET /nodes?search=` 请求
- **THEN** 后端允许的搜索字段 SHALL 仅含 `ip`（`ALLOWED_SEARCH_FIELDS` 不含 `name`）

### Requirement: 节点操作

节点管理页面 SHALL 支持对节点执行启动、停止、reload、状态查询、安装 OpenResty/Edge、关联新 OpenResty、升级 Edge 小版本等运维操作。现有单节点操作（SSE 流式 + NodeExecutionResultDrawer）SHALL 保持可用，同时 SHALL 提供**任务化入口**：将操作提交为可持久化的异步任务，供全局任务中心查询/取消/重试。

#### Scenario: 现有单节点操作保持可用
- **WHEN** 用户在节点管理页对单个节点执行启动/停止/reload/状态查询/安装等操作
- **THEN** 现有交互（直接 api.post 或 SSE 流式 + 结果抽屉）SHALL 保持与现状一致，不受任务化影响（双轨并存）

#### Scenario: 任务化入口创建任务
- **WHEN** 用户在节点管理页勾选一个或多个节点并选择任务化操作（如批量安装 OpenResty）
- **THEN** 系统 SHALL 提交创建任务请求（POST /clusters/{cluster_id}/node-tasks）
- **AND** 创建成功后 SHALL 展示任务状态（可跳转任务详情或内嵌进度展示）
- **AND** 任务执行过程 SHALL 不依赖前端页面存活（刷新/关闭页面后任务继续执行）

#### Scenario: 批量操作任务化入口
- **WHEN** 用户勾选多个节点并执行批量启动/停止/reload/状态查询
- **THEN** 页面 SHALL 提供"任务化执行"选项（区别于现有的前端并发编排批量操作）
- **AND** 任务化批量 SHALL 由后端引擎统一调度（per-node 子任务 + 全局并发信号量）

#### Scenario: 启动节点
- **WHEN** 用户点击某节点的"启动"按钮
- **THEN** 系统弹出确认对话框
- **AND** 确认后执行节点启动操作
- **AND** 展示操作执行过程 Drawer

#### Scenario: 停止节点
- **WHEN** 用户点击某节点的"停止"按钮
- **THEN** 系统弹出确认对话框
- **AND** 确认后执行节点停止操作
- **AND** 展示操作执行过程 Drawer

#### Scenario: 状态查询
- **WHEN** 用户点击某节点的"状态查询"按钮
- **THEN** 系统执行节点状态查询
- **AND** 展示状态查询结果 Drawer，包含 Edge 版本、CPU/内存使用率等信息

#### Scenario: 启动节点成功后状态自动同步
- **WHEN** 用户点击"启动"且命令执行成功
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 停止节点成功后状态自动同步
- **WHEN** 用户点击"停止"且命令执行成功
- **THEN** `node.status` SHALL 被设为 0（停用）

#### Scenario: 重启节点成功后状态自动同步
- **WHEN** 用户点击"重启"且命令执行成功
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 配置检查成功后不更新状态
- **WHEN** 用户点击"检测"且 `nginx -t` 配置检查成功
- **THEN** `node.status` SHALL NOT 被修改（配置检查不代表进程状态）
- **AND** `node.status_detail` 仍被更新

#### Scenario: 状态查询发现 nginx 运行中
- **WHEN** 用户点击"状态查询"且命令执行成功，解析到 `nginx_running=True`
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 状态查询发现 nginx 未运行
- **WHEN** 用户点击"状态查询"且命令执行成功，解析到 `nginx_running=False` 且 `nginx_status != "unknown"`
- **THEN** `node.status` SHALL 被设为 0（停用）

#### Scenario: 状态查询返回不可解析结果
- **WHEN** 用户点击"状态查询"且命令执行成功，但 `_parse_nginx_status` 返回 `nginx_status="unknown"`
- **THEN** `node.status` SHALL NOT 被修改（不可解析不代表 nginx 实际状态）

#### Scenario: 任何操作失败不更新状态
- **WHEN** 用户执行任意节点操作且命令执行失败（SSH 不通、返回码非零等）
- **THEN** `node.status` SHALL NOT 被修改
- **AND** `node.status_detail` 仍被更新以记录失败信息

#### Scenario: 编辑节点
- **WHEN** 用户在更多菜单点击"编辑"
- **THEN** 弹出编辑节点弹窗，预填当前节点信息
- **AND** 用户修改后提交，系统更新节点并刷新列表

#### Scenario: 删除节点（如实告知单语义确认）
- **WHEN** 用户在独立节点管理页或统一管理集群节点 Tab 点击"删除"
- **THEN** 弹出共享的节点删除确认弹窗（无勾选项，确认按钮为危险色），正文如实告知三层后果：
- **AND** 平台管理记录将被删除（不可恢复，如需恢复须重新添加节点）
- **AND** 节点机上的 Edge/OpenResty 进程不受影响，将继续运行（脱离平台监控）
- **AND** 该节点将从下次发布与中继网关白名单中移除
- **AND** 正文提示「如需先停止流量，请先执行『停止』操作」
- **AND** 确认后走共享删除进度弹窗执行删除，请求语义为删除平台记录（`delete_db=true, delete_edge=false`）

#### Scenario: 数据库对比
- **WHEN** 用户在更多菜单点击"数据库对比"
- **THEN** 打开配置对比 Drawer，展示该节点上配置与本地数据库的差异

#### Scenario: 执行日志不含结构化事件原文
- **WHEN** SSE 流推送无 line 字段的结构化事件（如 node_start/complete）
- **THEN** 执行日志展示区 SHALL NOT 显示该事件的 JSON 原文
- **AND** 依赖该事件的业务状态判定（如 complete）SHALL 不受影响

#### Scenario: 非安装类流式操作展示动作摘要
- **WHEN** 用户执行「关联新 OpenResty」「添加版本包」「切换版本」等非安装类流式操作并打开结果抽屉
- **THEN** 抽屉 SHALL 展示动作类摘要（SHALL NOT 套用安装成功/失败徽标与 Nginx 进程卡片的安装态解读）

#### Scenario: 操作失败提示包含具体原因
- **WHEN** 节点操作或列表加载请求失败且后端返回结构化 detail（含 Pydantic 校验数组）
- **THEN** 错误提示 SHALL 展示字段定位与原因（统一走 `getApiErrorMessage`）
- **AND** SHALL NOT 统一显示「操作失败」兜底文案
