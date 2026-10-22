# edge-env-remote-editing 变更（edge-env-port-validation）

## MODIFIED Requirements

### Requirement: 发布 edge.env

系统 SHALL 提供接口 `POST /api/v1/clusters/{clusterId}/edge-env/deploy` 将编辑后的 edge.env 发布到指定节点。

#### Scenario: 空内容检查
- **WHEN** 编辑器内容为空，用户点击"发布"按钮
- **THEN** 系统 SHALL 弹出提示"编辑器内容为空，请先读取节点配置或输入内容"
- **AND** 不打开发布弹窗

#### Scenario: 无节点集群发布拦截
- **WHEN** 所选集群没有任何节点
- **THEN** 「发布」按钮 SHALL 置灰不可点击（对齐「无活跃节点时显示提示」场景）
- **AND** 空态指引 SHALL 引导用户先为该集群添加节点

#### Scenario: 发布前字段验证
- **WHEN** 用户点击"发布"按钮且编辑器内容非空
- **THEN** 前端/后端 SHALL 验证 YAML 合法性
- **AND** SHALL 验证以下字段必须存在且合法：
  - `deploy` 顶层字段
  - `deploy.http` 字段
  - `deploy.http.edge.listen` 字段，且不为空列表
  - `deploy.http.admin.listen` 字段，且不为空列表
- **AND** `deploy.http.edge.listen` 与 `deploy.http.admin.listen` 的每个条目（`addr` 字段，或纯字符串条目）中 `host:port` 的端口部分 SHALL 为 1-65535 的整数；`unix:` 前缀条目 SHALL 跳过端口校验
- **AND** 验证不通过时 SHALL 提示具体错误（含字段路径；YAML 语法错误含行号；端口非法含项序号、原值与合法范围，如「deploy → http → edge → listen 第 1 项端口非法: 0.0.0.0:99999（端口须为 1-65535 的整数）」）

#### Scenario: 发布节点选择弹窗
- **WHEN** 字段验证通过
- **THEN** 弹窗 SHALL 显示集群所有节点列表（多选复选框），**默认勾选全部在线节点**
- **AND** 非活跃节点（status≠1）SHALL 置灰不可选，行内标注"离线"
- **AND** 弹窗顶部 SHALL 提供「全选」「取消全选」链接与「已选择 N / 在线 M 台」计数（全选仅作用于在线节点，分母排除离线）
- **AND** 未选中任何节点时 SHALL NOT 在弹窗打开时即显示红色报错；校验提示仅在该用户点击确认且选中数为 0 时出现
- **AND** 弹窗 SHALL 显示后果说明行：「将把上述内容写入所选节点并执行 edge init/reload 生效」
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

#### Scenario: YAML 校验通过后开始发布
- **WHEN** YAML 校验通过
- **THEN** 后端 SHALL 逐个遍历选中的节点，串行执行发布
- **AND** 对每个节点执行的步骤：
   1. 备份远端 `edge.env` → `edge.env.bak.{timestamp}`
   2. 通过 `ansible.builtin.copy` 的 `content` 参数写入新 edge.env
   3. 执行 `cd {node.edge_path} && bin/edge init`
   4. 执行 `cd {node.edge_path} && bin/edge reload`

#### Scenario: 节点成功判定包含 init 真实结果
- **WHEN** 后端遍历节点的 ansible 执行流
- **THEN** `bin/edge init` 步骤 SHALL 以真实退出码判定失败（`failed_when: rc != 0`），失败节点 SHALL 标记为 failed
- **AND** `bin/edge reload` 步骤保持宽松判定，但执行异常时节点结果 SHALL 附 `warning` 字段，前端在节点卡上以警示样式展示
- **AND** 不得仅凭"ansible 流正常结束"或 rc==0 而 init 实际失败判定成功

#### Scenario: 部署失败错误文案与读取一致
- **WHEN** 节点发布失败
- **THEN** 节点错误信息 SHALL 经与读取流共享的转译逻辑生成可行动文案（无法连接/SSH 认证失败/不在主机清单等）
- **AND** 未命中已知模式时 SHALL 显示「发布失败（ansible rc={rc}），详情见下方日志」，SHALL NOT 仅显示裸退出码

#### Scenario: 发布进度弹窗发布中不可关闭
- **WHEN** 发布流程进行中
- **THEN** 进度弹窗 SHALL 禁用关闭（发布不可取消，诚实呈现）
- **AND** 全部节点执行完毕后 SHALL 显示汇总条（全部成功/部分成功/全部失败 + 成功 N / 失败 M）
- **AND** 存在失败节点时 SHALL 提供「重试失败节点」入口，点击后以失败节点集重新进入发布流程（预填集过滤已离线节点）
- **AND** 重试时 diff 按 dirty 分流：内容相对上次尝试有修改 SHALL 照常展示 diff 确认；无修改 SHALL 跳过 diff 直达节点选择弹窗

#### Scenario: 完成反馈与结果一致
- **WHEN** 前端收到 complete 事件
- **THEN** `all_success` SHALL toast「发布完成」（success）
- **AND** `partial` SHALL toast「发布完成，N 个节点失败，请查看失败原因」（warning）
- **AND** `all_failed` SHALL toast「发布失败」（error）
- **AND** 全部失败时 SHALL NOT 出现任何成功语义提示
- **AND** complete 事件（可能无 line 字段）SHALL 被前端正确处理，不得因缺少 line 字段而丢弃
