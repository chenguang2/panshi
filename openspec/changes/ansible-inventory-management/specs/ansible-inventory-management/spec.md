## ADDED Requirements

### Requirement: 查看主机清单

系统 SHALL 提供管理员查看 Ansible inventory 的能力，同时返回结构化数据与原文。

#### Scenario: 管理员打开页面
- **WHEN** 管理员进入「Ansible 主机清单」页面
- **THEN** 表格视图展示全部主机（IP、SSH 用户、SSH 密码明文）与组级默认凭据
- **AND** 源码视图可查看文件原文（含注释）

#### Scenario: 非管理员拒绝
- **WHEN** 非管理员用户访问本功能任意接口
- **THEN** 返回 403

#### Scenario: inventory 文件不存在时返回空结构
- **WHEN** inventory 文件尚未创建（全新部署）时管理员打开页面
- **THEN** 返回空清单（hosts 为空、vars 为空、原文为空），不报错；保存时自动创建目录与文件

#### Scenario: 未录入平台的 IP 联动提示
- **WHEN** inventory 中存在平台节点表未录入的 IP
- **THEN** 页面展示提示列表，引导管理员前往节点管理添加

### Requirement: 表格视图编辑

系统 SHALL 支持在表格视图中对主机进行增删改，并编辑组级默认凭据。

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

#### Scenario: 未知字段提示
- **WHEN** 某 host 条目带有除凭据字段外的自定义键
- **THEN** 表格中该行显示提示，说明此类内容需在源码模式下维护

### Requirement: 源码视图编辑

系统 SHALL 提供 Monaco YAML 源码视图，保留文件原文内容（含注释）的编辑能力。

#### Scenario: 语法错误阻止保存
- **WHEN** 编辑器内容无法通过 YAML 解析或结构校验
- **THEN** 保存被拒绝，返回具体错误（含行号尽量定位），文件保持不变

#### Scenario: 原文保留
- **WHEN** 在源码视图提交修改
- **THEN** 文件按提交内容原样写回（保留注释与自定义字段）

### Requirement: 双模式切换

系统 SHALL 支持表格视图与源码视图双向切换，草稿内容互相转换且 YAML 逻辑由服务端承担。

#### Scenario: 表格切换到源码
- **WHEN** 用户在表格视图有未保存修改后切到源码视图
- **THEN** 编辑器内容由服务端根据表格草稿渲染生成

#### Scenario: 源码解析失败时禁止切换
- **WHEN** 源码视图内容无法解析时用户尝试切回表格视图
- **THEN** 切换被阻止并提示先修正语法错误

### Requirement: 保存护栏

系统 SHALL 在每次成功保存前自动备份当前文件，并以原子方式写回。

#### Scenario: 自动备份
- **WHEN** 保存成功
- **THEN** 保存前的文件被复制为 `host.bak.<时间戳>`，备份保留最近 10 份

#### Scenario: 运行中任务禁止保存
- **WHEN** 存在运行中的节点任务或 playbook 时提交保存
- **THEN** 返回 409 提示稍后再试，文件保持不变（防止固化注入中的临时凭据/端口）

#### Scenario: 原子写回立即生效
- **WHEN** 保存成功
- **THEN** 文件以原子替换方式更新，节点任务等运行时功能随即使用新清单，无需重启

### Requirement: 功能开关

本功能 SHALL 受 `features.yaml` 开关 `ansible_inventory` 控制，默认启用。

#### Scenario: 关闭开关
- **WHEN** `ansible_inventory` 设为 false 并重启平台
- **THEN** 侧边栏不显示该菜单，相关 API 返回 404
