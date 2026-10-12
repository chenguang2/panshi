# shared-publish-flow Delta

## ADDED Requirements

### Requirement: 发布进度诚实反馈

共享发布进度（`executePublish`）的过程反馈 SHALL 如实反映执行状态：现发布为单请求 API（后端内部遍历节点，前端无逐节点完成事件），过程日志 SHALL 显示「正在同步 N 个节点...」并呈不确定态进度（完成时一次性出终态结果）；SHALL NOT 使用固定假步骤（10→30→70→100）与人为延迟制造进度假象，SHALL NOT 呈现无数据支撑的百分比真值。SSE 逐节点发布流不在本变更范围（另立项）。

#### Scenario: 执行中过程反馈
- **WHEN** 发布执行中且共 N 个节点
- **THEN** 过程日志 SHALL 显示「正在同步 N 个节点...」
- **THEN** 进度 SHALL 为不确定态（spinner/无百分比或空进度条），SHALL NOT 显示中间百分比数值

#### Scenario: 终态行为不变
- **WHEN** 发布成功 / partial / 失败
- **THEN** 终态渲染（成功提示、失败明细、「重新发布」出口）SHALL 维持既有实现不变

### Requirement: 确认弹窗节点清单全量拉取

删除/发布确认弹窗的 Edge 节点清单 SHALL 经共享「全量拉取集群节点」工具分页循环拉取（后端 `page_size` 上限 MAX_PAGE_SIZE=500，total 超限时续拉后续页直至取全）；SHALL NOT 依赖后端默认 `page_size=20` 静默截断，也 SHALL NOT 以单页 `page_size=500` 充当全量（>500 节点集群仍截断且无提示）。

#### Scenario: 大集群节点清单完整
- **WHEN** 集群节点数超过单页上限（20 或 500）并打开删除/发布确认弹窗
- **THEN** 节点清单 SHALL 列出全部节点（分页循环拉取，多页结果合并）

#### Scenario: 删除与发布链路共用
- **WHEN** 独立页删除入口（如 RouteList `deleteRoute`）、Tab 删除链路（`useClusterResourceCore.proceedDelete` 的节点装载）或发布确认（PublishConfirmModal）拉取节点
- **THEN** SHALL 一律走共享全量拉取工具（SHALL NOT 各自内联单页请求）
