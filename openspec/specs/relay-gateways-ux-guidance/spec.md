# relay-gateways-ux-guidance Specification

## Purpose
TBD - created by archiving change relay-gateways-ux-redesign. Update Purpose after archive.

## Requirements

### Requirement: 页面自解释说明卡

中继区域管理页 SHALL 在页顶展示结论式说明卡：一句话说明中继区域是什么与何时需要，附「登记区域 → 初始化网关 → 下发配置」三步走顺序提示，并可折叠展开三个易混动作（初始化网关/下发配置/配置跳板转发）的对照表（何时用 / 做什么 / 是否幂等）。

#### Scenario: 新用户首次进入页面

* WHEN 用户打开中继区域管理页
* THEN 无需外部文档即可从说明卡获知「要先登记区域、再初始化网关、最后下发配置」的操作顺序
* THEN 展开对照表可区分三个易混动作的用途与幂等性

### Requirement: 表单字段分层与帮助文案

新建/编辑弹窗的 12 个字段 SHALL 按四层分组（基础身份 / 网关连接方式 / SSH 凭据 / 高级参数折叠），每个字段提供回答「填什么 + 不填会怎样」的帮助文案。

#### Scenario: 直连区域语义显性化

* WHEN 用户在表单中选择「直连区域」分段
* THEN 网关 HTTP 腿与 SSH 跳板输入禁用并清空
* AND 保存后该区域两条腿均为空（等价既有直连语义）
* WHEN 编辑一个两腿均为空的区域
* THEN 表单回显「直连区域」选中态

#### Scenario: 两腿全空保存提示

* WHEN 选择「有网关机」但两腿输入均为空并保存
* THEN 保存成功（等价直连）且弹出一次性提示「两腿均为空，将按直连区域保存」

#### Scenario: SSH 凭据语义保持

* WHEN 编辑已有凭据的网关
* THEN 口令框按需单查回填并展示「已从服务端加载（加载动作已记录审计）」占位
* THEN 口令不出现在任何列表响应中（既有语义不变）

### Requirement: 动作按钮可发现性

行内动作 SHALL 提供二级描述（菜单项名 + 一句话用途），删除 SHALL 反映集群挂接保护。

#### Scenario: 删除保护指引

* WHEN 区域被 N 个集群挂接（attached_cluster_count > 0，后端聚合字段）
* THEN 删除菜单项置灰且描述为「已被 N 个集群挂接，先解挂再删除」
* WHEN 后端字段未就绪（过渡态）
* THEN 删除可点，确认弹窗强调挂接保护，409 时给出解挂指引

### Requirement: 表格信息密度收敛

区域列表 SHALL 精简为：区域码 / 展示名 / 网关两腿（合并列，直连区域徽章）/ 状态（含清单缺组标签）/ 健康状态 / 更新时间 / 操作；SSH 用户与 OpenResty 前缀 SHALL NOT 作为独立列展示（保留在表单与配置预览中）。

#### Scenario: 列精简后信息不丢失

* WHEN 用户查看区域列表
* THEN 每行可直读两条腿地址（合并列）或「直连区域」徽章
* THEN SSH 用户与 OpenResty 前缀可通过编辑弹窗与配置预览查看
