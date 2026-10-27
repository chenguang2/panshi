# ansible-inventory-ux-review-fixes 变更规格 — ansible-inventory-management 域增量

## ADDED Requirements

### Requirement: 保存护栏跨载荷形态一致

`PUT /ansible/inventory` 的两种载荷形态（`raw_text` 与 `hosts+vars`）SHALL 执行同等保存护栏：结构校验（主机键须为 IPv4 或主机名、主机值为映射或空）。删除保护 SHALL NOT 存在（2026-10-27 用户二次裁决：清单与节点管理解耦，移除平台已录入的 IP 直接保存生效，不再按节点表拦截任何保存/恢复）。

#### Scenario: 源码模式删除受管主机直接保存
- **GIVEN** 平台节点管理中存在 IP `192.168.0.13` 且保存前清单中已有该 IP
- **WHEN** 管理员以 `raw_text` 载荷提交不含该 IP 的清单
- **THEN** 系统 SHALL 保存成功并写盘（移除即生效，不因节点表仍有该记录而拒绝）

#### Scenario: 平台存在但清单从来没有的 IP 不阻止保存
- **GIVEN** 平台节点管理中存在 IP `9.9.9.9`，保存前清单中从来没有该 IP（如其他集群节点）
- **WHEN** 管理员提交不含该 IP 的清单（任意载荷形态）
- **THEN** 系统 SHALL 保存成功（清单不收录与己无关的节点不是删除）

#### Scenario: 源码模式主机键不合法被拒绝
- **WHEN** 管理员以 `raw_text` 载荷提交含不合法主机键（如含空格或特殊字符）的清单
- **THEN** 系统 SHALL 返回 400 并提示主机键不合法，MUST NOT 写盘

### Requirement: 清单备份与恢复

系统 SHALL 提供保存时自动备份的可见入口：页面 SHALL 展示备份列表（备份时间，保留策略内最新在前）并支持查看备份内容（只读源码预览）；管理员 SHALL 可将任一备份一键恢复为当前清单。恢复 SHALL 以备份内容走既有保存全护栏（载荷校验 → 运行中任务 409 → 解析/结构校验 → 备份当前文件后原子写回），恢复动作 SHALL 写操作审计；恢复前 SHALL 弹确认窗（显示备份时间与恢复即覆盖当前清单的说明）。

#### Scenario: 备份列表与预览
- **WHEN** 管理员进入备份列表
- **THEN** SHALL 按时间倒序展示保存时自动生成的备份（时间），并提供只读内容预览（源码形态）

#### Scenario: 一键恢复
- **WHEN** 管理员确认恢复某备份
- **THEN** 系统 SHALL 以该备份内容执行保存全护栏并原子写回
- **AND** 恢复前 SHALL 展示确认弹窗（说明将覆盖当前清单）
- **AND** 恢复动作 SHALL 记入操作审计

#### Scenario: 恢复被护栏拒绝时如实报告
- **GIVEN** 存在运行中的节点任务
- **WHEN** 管理员尝试恢复
- **THEN** 系统 SHALL 返回既有 409/400 语义并如实展示原因，MUST NOT 写盘

### Requirement: 保存反馈与清单元数据

保存成功后，页面 SHALL 展示含规模的反馈（如「已保存并生效：N 台主机」，N 为本次保存的主机数）。清单查看响应 SHALL 携带文件最后修改时间，页面 SHALL 展示「清单最后修改：{时间}」元数据，并提供操作日志入口（跳转审计查询页）。

#### Scenario: 保存成功反馈含规模
- **WHEN** 管理员保存包含 N 台主机的清单成功
- **THEN** 反馈 SHALL 说明「已保存并生效：N 台主机」，MUST NOT 仅展示无上下文的「已生效」

#### Scenario: 最后修改时间可见
- **WHEN** 管理员进入清单页
- **THEN** 页面 SHALL 展示清单文件最后修改时间（来自服务端文件元数据）

#### Scenario: 操作日志入口
- **WHEN** 管理员点击「操作日志」
- **THEN** SHALL 跳转审计查询页（本模块的保存/恢复记录可追溯）

### Requirement: 批量导入预览

批量导入弹窗 SHALL 在确认前展示双摘要：「将新增 N 台」与「将覆盖 M 条现有主机凭据」；导入口径（每行 `主机键 [SSH用户] [SSH密码]`，主机键为 IPv4 或主机名）SHALL 在弹窗内说明；当解析出的主机键不是 IPv4 形态时，该行 SHALL 展示警示说明（主机键将按主机名原样保存），MUST NOT 静默通过。

#### Scenario: 双摘要预览
- **WHEN** 管理员粘贴含既有 IP 与新 IP 的混合文本
- **THEN** 预览 SHALL 同时展示「将新增 N 台」与「将覆盖 M 条现有主机凭据」

#### Scenario: 非 IP 主机键警示
- **WHEN** 某行主机键为合法主机名而非 IPv4（如 `bad`）
- **THEN** 该行 SHALL 展示警示说明（主机键按主机名原样保存），同时保留导入能力
- **AND** 弹窗 SHALL 说明主机键口径（IPv4 或主机名）

### Requirement: 高级字段校验错误定位

表格视图保存前的高级字段校验失败时，页面 SHALL 自动展开首个出错主机行并将出错字段行内标红显示原因；MUST NOT 仅以 toast 汇总提示。

#### Scenario: 校验失败定位到字段
- **WHEN** 第 2 行主机的 SSH 端口越界且第 3 行存在其他高级字段错误
- **THEN** 页面 SHALL 展开第 2 行并将端口输入框行内标红显示原因
- **AND** 汇总信息 SHALL 可用但 MUST NOT 是唯一呈现形态

## MODIFIED Requirements

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
<!-- 标题为稳定标识符，保留不改名；行为已按 2026-10-27 用户二次裁决反转 -->
- **WHEN** 管理员删除节点管理中已录入的主机（IP 存在于平台节点表）并保存
- **THEN** 保存成功，该主机从清单文件中移除（清单与节点管理解耦，不做删除保护；节点管理记录不受影响）

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
