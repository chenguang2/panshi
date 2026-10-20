## Purpose

静态资源的上传、发布、删除和版本管理功能。

## Requirements

### Requirement: 静态资源上传

用户 SHALL 能够上传一个 zip 格式的静态资源压缩包，并为其指定名称和 URL 访问路径。上传后系统自动解压并准备发布。

#### Scenario: 成功上传
- **WHEN** 用户上传一个有效的 zip 文件并填写名称和 URL 路径
- **THEN** 系统保存静态资源元数据，返回资源 ID

#### Scenario: 上传非 zip 文件
- **WHEN** 用户上传非 zip 格式的文件
- **THEN** 系统拒绝上传并提示格式错误

### Requirement: 静态资源发布

用户 SHALL 能够发布静态资源，将 zip 内容分发到集群中所有活跃 Edge 节点。

#### Scenario: 发布到活跃节点
- **WHEN** 用户点击发布按钮
- **THEN** 系统解压 zip，将文件通过 Admin API 分发到每个活跃 Edge 节点
- **AND** 系统在 Edge 节点上创建对应的路由（`uri: /static/{name}/*plugin: static_resource`）

#### Scenario: 发布结果展示
- **WHEN** 发布完成
- **THEN** 系统展示每个节点的同步状态（成功/失败）
- **AND** 系统记录版本号到 ConfigVersion

### Requirement: 静态资源删除

用户 SHALL 能够删除已创建的静态资源，系统自动清理 Edge 节点上的文件和相关路由。

#### Scenario: 删除静态资源
- **WHEN** 用户确认删除一个静态资源
- **THEN** 系统从各 Edge 节点删除对应目录和路由

### Requirement: 静态资源版本管理

每次发布 SHALL 生成新版本号，并记录到 ConfigVersion 表中，支持查看历史版本。

#### Scenario: 查看版本历史
- **WHEN** 用户查看静态资源的版本管理
- **THEN** 展示所有历史版本、发布时间和发布结果

### Requirement: 静态资源管理页面

静态资源管理页面 SHALL 独立于集群上下文，提供全局视图。

#### Scenario: 卡片网格展示
- **WHEN** 存在静态资源
- **THEN** 每个资源 SHALL 以卡片形式在 3 列网格中展示
- **THEN** 每张卡片 SHALL 显示：名称、路径、描述、文件信息、操作按钮

#### Scenario: 创建/编辑
- **WHEN** 管理员点击"添加静态资源"或"编辑"
- **THEN** StaticResourceFormModal SHALL 打开
- **THEN** "所属集群" SHALL 出现在表单中

#### Scenario: 操作
- **WHEN** 管理员点击操作按钮
- **THEN** SHALL 使用与集群管理相同的函数

#### Scenario: 卡片操作按钮（查看 ZIP 内容）
- **WHEN** 管理员点击操作按钮
- **THEN** SHALL 使用与集群管理相同的函数
- **AND** 卡片操作区新增"查看"按钮，位于"上传 ZIP"按钮之前
- **AND** 仅当静态资源已上传 ZIP（存在 `file_size`）时，"查看"按钮可点击
- **AND** 未上传 ZIP 时，"查看"按钮置灰（disabled），鼠标悬停时 title 提示"暂未上传 ZIP 文件"

#### Scenario: 创建表单路由下拉标注不合格项
- **WHEN** 创建/编辑弹窗打开且路由列表已加载
- **THEN** 不满足静态资源承载条件的路由 SHALL 以 disabled + 原因后缀呈现：「（路径须以 /* 结尾）」「（未发布）」「（未挂静态资源插件）」
- **AND** 合格路由 SHALL 正常可选；集群子页 Tab 入口 SHALL 与本页同规则（共用同一资格判定工具）

#### Scenario: 创建表单路由下拉占位可见
- **WHEN** 添加弹窗打开、或切换集群重置路由选项后
- **THEN** 路由下拉 SHALL 显示占位文案「请选择路由」，SHALL NOT 呈现空白选中态
- **AND** 表单模型初值与所有重置点 SHALL 与占位 option 的 value 精确匹配（`value=""` ↔ `''`）

#### Scenario: 必填标记一致
- **WHEN** 查看创建弹窗表单
- **THEN** 「所属集群」与「选择路由」SHALL 一致带必填 `*` 标记

#### Scenario: 上传过程进度反馈
- **WHEN** 用户在本页触发 zip 上传
- **THEN** SHALL 呈现与集群子页 Tab 一致的进度反馈（进度 + 逐行日志），上传期间上传按钮 SHALL 禁用
- **AND** 上传结果行 SHALL NOT 显示服务器存储路径，SHALL 显示「已保存到管理端（版本 vN，大小）」与「发布后才会更新节点文件」

#### Scenario: 路由冲突报错可行动
- **WHEN** 用户为已关联静态资源的路由重复创建
- **THEN** 错误提示 SHALL 为「该路由已关联静态资源「{name}」，请先删除该资源或更换路由」

#### Scenario: 徽章文案不夸大分发状态
- **WHEN** 资源已上传 zip 但未经发布确认分发
- **THEN** 卡片徽章 SHALL NOT 显示「已发布」；分发前的中性态 SHALL 表达「已上传 vX」（过渡语义，最终由分发状态徽章取代——见 publish-badges 静态资源条目）

#### Scenario: 过滤态计数语义
- **WHEN** 搜索或分组过滤激活
- **THEN** 计数 SHALL 显示「匹配 X / 共 Y 个静态资源」；无过滤时 SHALL 显示「共 X 个静态资源」

#### Scenario: 超出全量页上限提示截断
- **WHEN** 资源总数超过卡片网格全量页上限（500）
- **THEN** 网格尾部 SHALL 提示「仅显示前 500 个静态资源，请使用搜索缩小范围」

#### Scenario: 搜索框可清空
- **WHEN** 搜索框存在输入内容
- **THEN** SHALL 提供清空控件；清空后 SHALL 恢复全量列表

#### Scenario: 不渲染常驻 413 提示行
- **WHEN** 页面正常态（无上传/发布进行中）
- **THEN** 页面 SHALL NOT 常驻展示网关体积上限提示行；体积上限提示 SHALL 出现在上传/发布失败错误路径中
