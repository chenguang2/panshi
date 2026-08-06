## MODIFIED Requirements

### Requirement: 发布 edge.env

系统 SHALL 提供接口 `POST /api/v1/clusters/{clusterId}/edge-env/deploy` 将编辑后的 edge.env 发布到指定节点。

#### Scenario: 空内容检查
- **WHEN** 编辑器内容为空，用户点击"发布"按钮
- **THEN** 系统 SHALL 弹出提示"编辑器内容为空，请先获取配置模板或输入内容"
- **AND** 不打开发布弹窗

#### Scenario: 发布前字段验证
- **WHEN** 用户点击"发布"按钮且编辑器内容非空
- **THEN** 前端/后端 SHALL 验证 YAML 合法性
- **AND** SHALL 验证以下字段必须存在且合法：
  - `deploy` 顶层字段
  - `deploy.http` 字段
  - `deploy.http.edge.listen` 字段，且不为空列表
  - `deploy.http.admin.listen` 字段，且不为空列表
- **AND** 验证不通过时 SHALL 提示具体错误（如"缺少 deploy.http.edge.listen 字段"）

#### Scenario: 发布节点选择弹窗
- **WHEN** 字段验证通过
- **THEN** 弹窗 SHALL 显示集群所有节点列表（多选复选框），默认全选
- **AND** 活跃节点（status=1）正常可选
- **AND** 非活跃节点（status≠1）置灰不可选，旁标注"离线"
- **AND** 弹窗顶部 SHALL 提供「全选」「取消全选」链接与「已选择 N / M 个节点」计数
- **AND** 弹窗底部显示"确认发布"和"取消"按钮

#### Scenario: 发布请求格式
- **WHEN** 用户确认发布
- **THEN** 前端 SHALL 发送请求 `POST /api/v1/clusters/{clusterId}/edge-env/deploy`
- **AND** 请求体 SHALL 包含 `{"content": "<完整的 edge.env 文本>", "node_ids": [1, 3, 5]}`
- **AND** `node_ids` 为空时 SHALL 发布到所有活跃节点

#### Scenario: 后端 YAML 语法校验
- **WHEN** 后端收到发布请求
- **THEN** 后端 SHALL 对 content 做 YAML 语法校验
- **AND** 若 YAML 格式错误，SHALL 返回 HTTP 422
- **AND** 响应体 SHALL 包含错误行号和错误描述

#### Scenario: 节点成功判定基于 ansible rc
- **WHEN** 后端遍历节点的 ansible 执行流
- **THEN** 后端 SHALL 从 `_run_ansible_stream` 的最后一个 SSE 事件提取 `rc`
- **AND** 仅 `rc == 0` 时该节点 SHALL 标记为成功；`rc != 0`（含 UNREACHABLE）SHALL 标记为失败并记录 error（含 rc 值）
- **AND** 不得仅凭"ansible 流正常结束"判定成功（此前 rc≠0 节点被误判 success）

#### Scenario: 全部节点发布完成
- **WHEN** 所有节点发布完成
- **THEN** 后端 SHALL 返回每个节点的执行状态
- **AND** 整体状态标记为 `all_success`、`partial` 或 `all_failed`

#### Scenario: 部分节点发布失败
- **WHEN** 部分节点发布失败
- **THEN** 整体发布状态 SHALL 标记为 `partial`
- **AND** 继续发布剩余节点，不中断整个流程

#### Scenario: 前端显示整体状态与成功/失败计数
- **WHEN** 前端收到 complete 事件
- **THEN** 前端 SHALL 显示整体状态（全部成功/部分成功/全部失败）
- **AND** 附带显示「成功 N / 失败 M」计数（基于 node_results 统计）
- **AND** complete 事件（可能无 line 字段）SHALL 被前端正确处理，不得因缺少 line 字段而丢弃

### Requirement: diff 对比

发布前 SHALL 展示当前运行配置与待部署配置的差异。

#### Scenario: 发布确认弹窗显示 diff
- **WHEN** 用户点击"继续选择节点"前的确认变更弹窗
- **THEN** 前端 SHALL 在当前编辑器内容与最近一次获取模板的内容之间生成行级 diff
- **AND** 显示确认弹窗，diff 使用文本行级对比（新增行绿色高亮、删除行红色高亮）

#### Scenario: 无变更时提示
- **WHEN** 编辑内容与最近一次获取模板的内容相同
- **THEN** diff 显示"与上次获取的内容一致，无变更"
- **AND** 用户仍可选择节点并继续发布
