# Upstream Management

## ADDED Requirements

### Requirement: 上游复制

上游管理 SHALL 支持复制现有上游，基于其完整配置（含高级配置）快速创建相似上游。

#### Scenario: 操作按钮提供复制
- **WHEN** 用户在集群上游 Tab 或全局上游管理页展开上游操作菜单
- **THEN** 菜单 SHALL 包含「复制」选项
- **THEN** 复制 SHALL 在默认操作按钮中（defaultActions 含 copy），未配置列选项的新用户默认可见

#### Scenario: 复制后状态复位
- **WHEN** 用户复制后关闭弹窗，再点击「添加上游」或「编辑」
- **THEN** 标题 SHALL 显示「添加上游」/「编辑上游」（非「复制上游」），名称 SHALL NOT 残留「复制_」前缀

#### Scenario: 复制填充表单
- **WHEN** 用户点击「复制」
- **THEN** 表单 SHALL 打开并显示标题「复制上游」
- **THEN** 名称 SHALL 为「复制_源上游名」
- **THEN** 负载均衡策略、目标列表、健康检查、超时、连接池、重试等高级配置 SHALL 与源上游一致

#### Scenario: 复制保存为新建
- **WHEN** 用户在复制表单中点击保存
- **THEN** SHALL 走新建流程（POST），不修改原上游
- **THEN** 新建成功后原上游数据 SHALL 保持不变
