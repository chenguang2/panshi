# Ansible 主机清单管理

## Purpose

管理平台的 Ansible inventory（主机清单）文件，支持可视化编辑、结构化管理、凭据管理、高级连接变量配置，以及源码模式直接编辑 YAML。

## Requirements

### Requirement: 表格视图编辑

系统 SHALL 支持在表格视图中对主机进行增删改、编辑组级默认凭据，并支持常用连接变量的高级设置编辑。

#### Scenario: 新增主机
- **WHEN** 管理员在表格中新增一行并填写 IP、SSH 用户名、SSH 密码
- **THEN** 保存后该主机写入 inventory 文件的 `[edge_cluster]` 组
- **AND** 立即生效，节点任务执行时使用新配置

#### Scenario: 删除主机
- **WHEN** 管理员在表格中删除某主机行
- **THEN** 保存后该主机从 inventory 文件中移除
- **AND** 该节点后续不再执行节点任务

#### Scenario: 删除平台已录入的主机被阻止
- **WHEN** 管理员尝试删除节点管理中已录入的主机（IP 存在于平台节点表）
- **THEN** 保存被拒绝并提示该 IP 在节点管理中存在，无法删除

#### Scenario: 高级设置编辑
- **WHEN** 管理员展开某主机的"高级设置"
- **THEN** 可编辑 `ansible_port`、`ansible_host`、`ansible_connection`、`ansible_python_interpreter`、`ansible_become` 系列、`ansible_ssh_private_key_file`、`ansible_ssh_common_args`
- **AND** 保存后这些键写入 inventory，立即生效

#### Scenario: 高级字段帮助信息
- **WHEN** 管理员点击某高级字段旁的 📋 图标
- **THEN** 弹出参数速查面板，列出该字段的常用参数/值及其含义
- **AND** 点击任意参数行可复制到剪贴板

#### Scenario: 类型宽容与规范化
- **WHEN** `ansible_port` 提交为纯数字字符串、或 `ansible_become` 提交为 yes/no/true/false 字符串
- **THEN** 服务端规范化后写入（port 为整数、become 为布尔），保存成功

#### Scenario: 越界与自定义连接值
- **WHEN** `ansible_port` 超出 1-65535
- **THEN** 保存被拒绝并提示具体字段错误
- **AND** `ansible_connection` 为枚举外的合法字符串时照常保存（不做枚举强校验）

#### Scenario: 空值即删除
- **WHEN** 某高级字段被清空后保存
- **THEN** 该键从 host 条目中移除（不写入 YAML）

#### Scenario: 已知键不再标记为自定义字段
- **WHEN** 主机条目仅包含已知键清单内的字段
- **THEN** 不再显示"含自定义字段"标签；清单外的键仍按原机制保真保留并提示

#### Scenario: become 联动
- **WHEN** 管理员关闭提权 (become) 开关
- **THEN** 提权用户和提权密码输入框自动禁用（灰色不可编辑）
- **AND** 已填写的值不会被清空
- **WHEN** 重新开启 become 开关
- **THEN** 提权用户和提权密码恢复可编辑

### Requirement: 解析容忍行尾制表符

系统 SHALL 在解析 inventory 文件时剥离每行行尾空白（含制表符），使运维编辑器留下的行尾制表符不导致整个文件解析失败。

#### Scenario: 行尾制表符不阻塞解析
- **WHEN** inventory 文件中某主机条目的值行末尾存在制表符（如 `ansible_ssh_pass: 'pass'\t\t`）
- **THEN** 文件仍被成功解析，该主机正常出现在主机列表中
- **AND** 解析结果不包含错误

#### Scenario: 引号内制表符不受影响
- **WHEN** 某字段值内部包含制表符（如 `ansible_ssh_pass: 'pa\tss'`）
- **THEN** 该制表符作为值的一部分被保留，不被剥离

#### Scenario: 文件原文不被修改
- **WHEN** 含行尾制表符的文件被解析
- **THEN** GET 接口返回的 `raw_text` 仍为文件原始内容（含制表符），源码视图保真

### Requirement: 解析失败时返回并展示错误

系统 SHALL 在 inventory 文件存在但解析失败时，通过 GET 接口返回 `errors` 字段并在前端展示真实错误信息（含行号），不得静默返回空列表。

#### Scenario: 文件存在但解析失败
- **WHEN** inventory 文件存在但内容无法解析（如结构错误、YAML 语法错误）
- **THEN** GET `/ansible/inventory` 返回 `errors` 数组，包含具体错误信息与行号
- **AND** 前端页面展示红色错误条，显示该错误信息

#### Scenario: 解析失败时前端展示真实文件内容
- **WHEN** inventory 文件解析失败
- **THEN** 前端强制进入源码视图，展示文件原始内容供修复
- **AND** 用户修正源码并保存后，错误消除且页面恢复正常

#### Scenario: 文件不存在不误报
- **WHEN** inventory 文件不存在（全新部署）
- **THEN** GET `/ansible/inventory` 返回 `errors: []`，保持空结构行为
- **AND** 前端不展示解析错误提示
