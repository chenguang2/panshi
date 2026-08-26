## MODIFIED Requirements

### Requirement: 表格视图编辑

系统 SHALL 支持在表格视图中对主机进行增删改、编辑组级默认凭据，并支持常用连接变量的高级设置编辑。

#### Scenario: 高级设置编辑
- **WHEN** 管理员展开某主机的"高级设置"
- **THEN** 可编辑 `ansible_port`、`ansible_host`、`ansible_connection`、`ansible_python_interpreter`、`ansible_become` 系列、`ansible_ssh_private_key_file`、`ansible_ssh_common_args`
- **AND** 保存后这些键写入 inventory，立即生效

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
