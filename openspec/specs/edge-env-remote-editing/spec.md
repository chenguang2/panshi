# edge-env-remote-editing

## Purpose

允许用户在磐石 Admin 平台中远程读取、编辑和部署 Edge 网关的 `edge.env` 核心配置文件，替代手工 SSH 操作。

## Requirements

### Requirement: 全局页面入口

系统 SHALL 新增全局页面 `/edge-env`，支持 `?cluster_id=` 参数筛选，侧边栏"核心功能"区新增「edge.env 配置」导航入口。该页面受 `edge_env` 特性开关控制。

#### Scenario: 侧边栏显示入口
- **WHEN** 用户登录后查看侧边栏
- **THEN** 核心功能区 SHALL 显示「edge.env 配置」导航项
- **AND** 点击后跳转到 `/edge-env`

#### Scenario: 通过 cluster_id 打开特定集群的配置
- **WHEN** 用户访问 `/edge-env?cluster_id=1`
- **THEN** 页面 SHALL 加载集群的活跃节点列表
- **AND** 页面顶部 SHALL 显示集群选择器、节点选择器、"获取配置模板"和"发布"按钮
- **AND** 编辑器为空白，等待用户点击"获取配置模板"

#### Scenario: 未指定 cluster_id
- **WHEN** 用户访问 `/edge-env`（无 cluster_id 参数）
- **THEN** 页面 SHALL 显示集群选择器下拉框
- **AND** 用户选择集群后自动跳转到 `/edge-env?cluster_id={id}`

#### Scenario: 无活跃节点时显示提示
- **WHEN** 集群下没有任何活跃节点
- **THEN** 页面 SHALL 显示提示"当前集群无活跃节点，无法管理 edge.env"
- **AND** 编辑器、"获取配置模板"和"发布"按钮 SHALL 置灰

### Requirement: 节点选择与配置模板获取

系统 SHALL 提供节点列表接口和 edge.env 模板获取接口。页面不再自动加载配置，用户手动点击"获取配置模板"按钮从选中节点读取。

#### Scenario: 页面加载时获取节点列表
- **WHEN** 用户打开 edge.env 页面
- **THEN** 前端 SHALL 调用 `GET /api/v1/clusters/{clusterId}/nodes?status=1&page_size=100` 获取活跃节点列表
- **AND** 节点选择器下拉框 SHALL 显示每个节点的 IP:管理端口

#### Scenario: 获取配置模板（流式）
- **WHEN** 用户选中节点后点击"获取配置模板"按钮
- **THEN** 前端 SHALL 通过 SSE 调用 `GET /api/v1/clusters/{clusterId}/edge-env/read-stream?node_id={nodeId}`
- **AND** 弹窗 SHALL 显示 Ansible 执行过程日志（和部署弹窗样式一致）
- **AND** 执行完成后，最后一条 SSE 事件携带配置内容
- **AND** 弹窗不自动关闭，用户手动关闭

#### Scenario: 获取配置模板失败
- **WHEN** 选中节点不可达或读取失败
- **THEN** 弹窗 SHALL 显示错误信息
- **AND** 编辑器内容不变

#### Scenario: 切换节点时提示丢弃编辑内容
- **WHEN** 编辑器内容已修改，用户切换节点选择器
- **THEN** 页面 SHALL 弹出确认框"当前编辑内容尚未发布，切换节点将丢弃编辑内容，是否继续？"
- **AND** 用户确认后节点切换，内容保留为空

### Requirement: Monaco Editor YAML 编辑

前端 SHALL 使用 Monaco Editor 提供 YAML 编辑能力。

#### Scenario: YAML 编辑器加载
- **WHEN** 成功读取 edge.env 内容后
- **THEN** 页面 SHALL 渲染 Monaco Editor，语言模式设为 `yaml`
- **AND** 编辑器 SHALL 以读取的内容作为初始值

#### Scenario: YAML 语法高亮
- **WHEN** 编辑器加载内容
- **THEN** SHALL 显示 YAML 语法高亮（键值对着色、层级缩进线）

#### Scenario: 前端实时语法校验
- **WHEN** 用户编辑过程中 YAML 格式错误
- **THEN** Monae Editor SHALL 在错误行显示红色波浪线和标记

#### Scenario: 全屏编辑
- **WHEN** 用户点击"全屏"按钮
- **THEN** 编辑器 SHALL 切换到全屏模式

#### Scenario: Monaco Editor 异步加载
- **WHEN** 用户首次访问 edge.env 页面
- **THEN** Monaco Editor SHALL 通过异步加载（dynamic import）按需加载，不阻塞页面首次渲染

### Requirement: 发布 edge.env

系统 SHALL 提供接口 `POST /api/v1/clusters/{clusterId}/edge-env/deploy` 将编辑后的 edge.env 发布到指定节点。

#### Scenario: 空内容检查
- **WHEN** 编辑器内容为空，用户点击"发布"按钮
- **THEN** 系统 SHALL 弹出提示"编辑器内容为空，请先获取配置模板或输入内容"
- **AND** 不打开发布弹窗

#### Scenario: 发布前字段验证
- **WHEN** 用户点击"发布"按钮且编辑器内容非空
- **THEN** 前端/后端 SHALL 验证 YAML 合法性
- **AND** SHALL 验证以下字段必须存在且合法：
  - `deploy` 顶层字段
  - `deploy.http` 字段
  - `deploy.http.edge.listen` 字段，且不为空列表
  - `deploy.http.admin.listen` 字段，且不为空列表
- **AND** 验证不通过时 SHALL 提示具体错误（如"缺少 deploy.http.edge.listen 字段"）

#### Scenario: 发布节点选择弹窗
- **WHEN** 字段验证通过
- **THEN** 弹窗 SHALL 显示集群所有节点列表（多选复选框），默认全选
- **AND** 活跃节点（status=1）正常可选
- **AND** 非活跃节点（status≠1）置灰不可选，旁标注"离线"
- **AND** 弹窗底部显示"确认发布"和"取消"按钮

#### Scenario: 发布请求格式
- **WHEN** 用户确认发布
- **THEN** 前端 SHALL 发送请求 `POST /api/v1/clusters/{clusterId}/edge-env/deploy`
- **AND** 请求体 SHALL 包含 `{"content": "<完整的 edge.env 文本>", "node_ids": [1, 3, 5]}`
- **AND** `node_ids` 为空时 SHALL 发布到所有活跃节点

#### Scenario: 后端 YAML 语法校验
- **WHEN** 后端收到发布请求
- **THEN** 后端 SHALL 对 content 做 YAML 语法校验
- **AND** 若 YAML 格式错误，SHALL 返回 HTTP 422
- **AND** 响应体 SHALL 包含错误行号和错误描述

#### Scenario: YAML 校验通过后开始发布
- **WHEN** YAML 校验通过
- **THEN** 后端 SHALL 逐个遍历选中的节点，串行执行发布
- **AND** 对每个节点执行的步骤：
   1. 备份远端 `edge.env` → `edge.env.bak.{timestamp}`
   2. 通过 `ansible.builtin.copy` 的 `content` 参数写入新 edge.env
   3. 执行 `cd {node.edge_path} && bin/edge init`
   4. 执行 `cd {node.edge_path} && bin/edge reload`
   4. 执行 `cd {node.edge_path} && bin/edge reload`

#### Scenario: 发布内容通过 content 参数传递
- **WHEN** ansible-runner 执行 `edge_init_env` tag
- **THEN** 后端 SHALL 将 edge.env 文本内容作为 extravar `env_content` 传入
- **AND** playbook 中 SHALL 使用 `ansible.builtin.copy` 的 `content` 参数写入远端文件
- **AND** SHALL NOT 在 master 服务器创建临时文件

#### Scenario: 全部节点发布完成
- **WHEN** 所有节点发布完成
- **THEN** 后端 SHALL 返回每个节点的执行状态
- **AND** 整体状态标记为 `all_success`、`partial` 或 `all_failed`

#### Scenario: 部分节点发布失败
- **WHEN** 部分节点发布失败
- **THEN** 整体发布状态 SHALL 标记为 `partial`
- **AND** 继续发布剩余节点，不中断整个流程

### Requirement: diff 对比

发布前 SHALL 展示当前运行配置与待部署配置的差异。

#### Scenario: 发布确认弹窗显示 diff
- **WHEN** 用户点击"继续选择节点"前的确认变更弹窗
- **THEN** 前端 SHALL 在当前编辑器内容与最近一次获取模板的内容之间生成行级 diff
- **AND** 显示确认弹窗，diff 使用文本行级对比（新增行绿色高亮、删除行红色高亮）

#### Scenario: 无变更时提示
- **WHEN** 编辑内容与最近一次获取模板的内容相同
- **THEN** diff 显示"与上次获取的内容一致，无变更"
- **AND** 用户仍可选择节点并继续发布

### Requirement: SSE 实时发布日志

发布过程 SHALL 通过 SSE 推送实时日志，每个节点串行执行，日志按节点分组。

#### Scenario: SSE 端点返回流式日志
- **WHEN** 发布开始
- **THEN** 后端 SHALL 通过 SSE endpoint 推送日志
- **AND** 每条日志事件格式：`{"node": "<ip>", "step": "backup|write|init|reload", "status": "running|success|failed", "message": "..."}`
- **AND** 节点切换时推送事件：`{"node": "<ip>", "step": "node_start", "message": "开始部署节点 <ip>"}`

#### Scenario: 日志按节点分组展示
- **WHEN** 前端收到 SSE 日志事件
- **THEN** 发布进度弹窗 SHALL 按节点分组展示，每个节点一张卡片
- **AND** 卡片内展示该节点的各步骤状态（running/success/failed）
- **AND** 已完成步骤显示绿色对勾，当前步骤显示旋转动画，失败步骤显示红色叉号

#### Scenario: 串行发布，逐节点推送
- **WHEN** 集群有多个节点
- **THEN** 系统 SHALL 串行发布每个节点
- **AND** 上一个节点发布完成后才开始下一个节点
- **AND** SSE 依次推送每个节点的完整日志

### Requirement: 版本管理

系统 SHALL 使用 `ConfigVersion` 表（`ps_config_version`）记录版本历史，`resource_type='edge_env'`，`resource_id=cluster_id`。不再使用独立的 `EdgeEnvVersion` 表。

版本仅记录配置内容本身，不记录发布结果。

#### Scenario: 发布时创建版本记录
- **WHEN** 发布完成
- **THEN** 系统 SHALL 调用 `edge_sync.create_config_version(db, 'edge_env', cluster_id, cluster_id, config_data)` 创建版本记录
- **AND** 版本记录包含：集群 ID、完整 edge.env 内容（content 字段）、版本号（自动递增）、创建时间

#### Scenario: 查看版本历史列表
- **WHEN** 用户点击"版本管理"按钮
- **THEN** 页面 SHALL 显示版本列表（版本号、创建时间、创建人）
- **AND** 列表按版本号倒序排列
- **AND** 支持分页

#### Scenario: 查看版本详情
- **WHEN** 用户点击某个版本记录
- **THEN** 页面 SHALL 展示该版本的完整 edge.env 内容（只读模式）

#### Scenario: 加载历史版本到编辑器
- **WHEN** 用户在版本历史中点击"加载到编辑器"
- **THEN** 系统 SHALL 将该版本的内容填入编辑器
- **AND** SHALL NOT 自动发布，用户需要确认后手动点击"发布"

### Requirement: 编辑提示与确认

编辑器 SHALL 在特定情况下提示用户。

#### Scenario: 编辑器内容未保存时刷新提示
- **WHEN** 编辑器内容已修改但未发布，用户尝试刷新页面或切换集群
- **THEN** 页面 SHALL 提示"当前编辑内容尚未发布，确定要离开吗？"

#### Scenario: 获取模板时确认丢弃编辑
- **WHEN** 编辑器内容已修改，用户点击"获取配置模板"
- **THEN** 系统 SHALL 弹出确认"当前编辑内容将被丢弃，确定要获取模板吗？"
