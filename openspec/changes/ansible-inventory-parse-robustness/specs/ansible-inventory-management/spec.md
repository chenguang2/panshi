## ADDED Requirements

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