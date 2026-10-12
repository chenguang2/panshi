# node-management Delta

## MODIFIED Requirements

### Requirement: 状态筛选

页面 SHALL 提供状态筛选下拉框，选项为全部状态、运行中、已停止、未检测；筛选按运行态判定（nginx 运行状态），不按管理开关字段。

#### Scenario: 全部状态
- **WHEN** 用户选择"全部状态"
- **THEN** 系统显示所有节点

#### Scenario: 按运行中筛选
- **WHEN** 用户选择"运行中"
- **THEN** 系统仅显示运行态为"运行中"（status_detail 判定 nginx_running=true）的节点

#### Scenario: 按已停止筛选
- **WHEN** 用户选择"已停止"
- **THEN** 系统仅显示运行态为"已停止"（status_detail 判定 nginx_running=false）的节点

#### Scenario: 按未检测筛选
- **WHEN** 用户选择"未检测"
- **THEN** 系统仅显示从未执行过状态检测（无 status_detail 运行态信息）的节点

### Requirement: 节点详情查看

系统 SHALL 支持查看节点详情，展示节点属性及所在集群的统计数据（标注归属）。

#### Scenario: 查看节点详情
- **WHEN** 用户点击某节点的"详情"按钮
- **THEN** 弹出详情 Modal，展示节点属性（IP、所属集群、服务端口、管理端口、Edge路径、管理开关（启用/禁用）、运行态、创建时间）
- **AND** 展示节点所在集群的统计卡片（路由数、上游数、插件数、全局规则数、插件元数据、静态资源数），区块 SHALL 标注「集群级」归属——计数是该节点所在集群的统计，而非该节点自身资源数

## ADDED Requirements

### Requirement: 运行态三态展示与检测时效

节点运行态 SHALL 以三态呈现：运行中（status_detail 判定 nginx 运行）、已停止（判定未运行）、未检测（从未执行过检测，无运行态信息）；管理开关（配置态）徽章与运行态徽章 SHALL 并排展示（两个维度不得互相替代），配置态禁用徽章 SHALL 使用中性配色而非危险红。检测时效（最近一次检测时间）SHALL 对用户可见。

#### Scenario: 三态互斥渲染
- **WHEN** 节点列表或详情弹窗渲染节点运行态徽章
- **THEN** SHALL 按运行态三元判定渲染且互斥：运行中（成功色）/ 已停止（危险色）/ 未检测（中性灰）
- **AND** 从未检测过的节点 SHALL NOT 回退为「运行中」（假绿）

#### Scenario: 已禁用配置徽章中性化
- **WHEN** 渲染管理开关为禁用的节点行
- **THEN** 「已禁用」徽章 SHALL 使用中性灰配色（配置开关语义，非故障告警），SHALL NOT 使用危险红
- **AND** 与运行态徽章并排展示（符合「节点状态控件与措辞统一」需求的两维度承诺）

#### Scenario: 检测时效展示
- **WHEN** 节点存在 status_detail.last_execution
- **THEN** 运行态徽章下方 SHALL 以弱化文字展示相对时间（如「5 分钟前检测」）
- **AND** 时间解析与格式化 SHALL 走 utils/format.ts 单一实现（naive UTC 按 UTC 解析、本地时区展示）

#### Scenario: 手动刷新
- **WHEN** 用户点击节点列表的「刷新」按钮（独立页与统一管理 Tab 均提供）
- **THEN** 系统 SHALL 重新加载节点列表；Tab 侧 SHALL 走面板局部刷新，SHALL NOT 触发父级集群列表全量刷新
- **AND** 运行态徽章与检测时效 SHALL 反映最新数据

#### Scenario: Tab 表单措辞对齐
- **WHEN** 统一管理 Tab 渲染节点表单与批量导入的状态下拉
- **THEN** 选项 SHALL 为「启用/禁用」（「正常/禁用」在节点语境废弃，与「节点状态控件与措辞统一」需求对齐）
