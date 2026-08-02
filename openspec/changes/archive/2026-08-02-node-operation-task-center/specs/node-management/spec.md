# node-management — Delta Spec

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 任务中心跳转入口

节点管理页面 SHALL 提供进入全局任务中心的入口（链接/按钮），便于用户查看该集群或全局的节点操作任务历史。

#### Scenario: 从节点管理页进入任务中心
- **WHEN** 用户点击节点管理页的"节点任务"入口
- **THEN** 系统 SHALL 导航到 `/node-tasks` 全局任务中心页面
- **AND** 若来自集群上下文，SHALL 携带 cluster_id 过滤参数（对齐 `/nodes?cluster_id=` 先例）
