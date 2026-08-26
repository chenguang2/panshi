## MODIFIED Requirements

### Requirement: 表格视图编辑

系统 SHALL 支持在表格视图中对主机进行增删改、编辑组级默认凭据，并支持常用连接变量的高级设置编辑。

#### Scenario: 新增主机
- **WHEN** 管理员填写合法 IP 与可选 SSH 凭据并保存
- **THEN** 主机出现在清单中，保存后 inventory 文件更新且立即对节点任务生效

#### Scenario: 删除主机
- **WHEN** 管理员删除某主机并保存，且该 IP 不在平台节点表中
- **THEN** 该 IP 从 inventory 移除

#### Scenario: 删除平台已录入的主机被阻止
- **WHEN** 提交的保存中缺少某个平台节点表仍存在的 IP
- **THEN** 保存被拒绝（400），列出相关 IP 并提示先在节点管理删除或停用该节点

#### Scenario: 未知字段全保真保留
- **WHEN** host 条目带有自定义键或 vars 含凭据之外的键，经表格视图保存
- **THEN** 这些字段原样保留在写回的文件中，不静默丢弃

#### Scenario: 自定义字段以徽标提示
- **WHEN** 某 host 条目带有已知键清单之外的自定义键
- **THEN** 该行「高级」按钮上显示橙色圆点徽标，悬停 tooltip 列出具体键名并说明此类内容仅源码模式可维护、保存时原样保留
- **AND** 表格不再为自定义字段设置独立列

#### Scenario: 已知键不再标记为自定义字段
- **WHEN** 主机条目仅包含已知键清单内的字段
- **THEN** 不显示自定义字段徽标；清单外的键仍按原机制保真保留并提示

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

#### Scenario: 添加主机滚动定位与高亮
- **WHEN** 管理员点击表格底部的「＋ 添加主机」按钮
- **THEN** 在列表末尾追加空白行，页面自动滚动使新行进入视口，并以约 2 秒的高亮闪烁标识新行位置
- **AND** 新行的 IP 输入框自动获得焦点

#### Scenario: 回车续录
- **WHEN** 光标位于最后一行（IP 已填写）的 IP 输入框时按下 Enter
- **THEN** 追加新的空白行，滚动定位并以约 2 秒高亮标识新行，且新行 IP 输入框自动聚焦
- **AND** 最后一行 IP 为空时按 Enter 不追加新行
- **AND** 非最后一行的输入框按 Enter 不触发追加
- **AND** 输入法组合输入期间按 Enter 不触发追加

## ADDED Requirements

### Requirement: 批量粘贴导入

系统 SHALL 在表格视图提供批量导入弹窗，将多行粘贴文本解析为主机条目填入表格，解析全程在前端完成且不绕过既有保存流程；源码视图不重复提供该入口。

#### Scenario: 解析预览
- **WHEN** 管理员在批量导入弹窗中粘贴每行一条 `IP [SSH用户] [SSH密码]` 的文本（空白分隔即空格/Tab，支持空行、`#` 整行注释与行尾注释）
- **THEN** 弹窗实时显示识别出的记录条数（文本内去重后的最终写入条数），文本内部重复 IP 时提示合并数量
- **AND** 预览列表中密码以固定长度掩码占位，不明文回显
- **AND** 格式错误的行（如缺少 IP、段数超限、IP 不符合与后端一致的主机键口径）逐行提示原因，存在错误时确认按钮不可用

#### Scenario: 覆盖重复 IP
- **WHEN** 粘贴内容中的 IP 与表格现有行相同
- **THEN** 导入仅覆盖该行粘贴中提供的 SSH 用户/密码字段，未提及的凭据保持原值，高级字段与未知键一律保留，并在预览中标注将被覆盖的数量
- **AND** 粘贴内容内部 IP 重复时以后出现的行为准

#### Scenario: 导入后走统一保存流程
- **WHEN** 管理员确认导入
- **THEN** 条目填入表格并标记"有未保存修改"
- **AND** 后续保存仍经过既有的字段校验、删除保护与任务互斥检查
