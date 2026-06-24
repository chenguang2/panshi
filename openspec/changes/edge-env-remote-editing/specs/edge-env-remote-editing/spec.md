# edge-env-remote-editing Specification

## Purpose

允许用户在磐石 Admin 平台中远程读取、编辑和部署 Edge 网关的 `edge.env` 核心配置文件，替代手工 SSH 操作。

## ADDED Requirements

### Requirement: 全局页面入口

系统 SHALL 新增全局页面 `/edge-env`，支持 `?cluster_id=` 参数筛选，侧边栏"核心功能"区新增「edge.env 配置」导航入口。

#### Scenario: 侧边栏显示入口
- **WHEN** 用户登录后查看侧边栏
- **THEN** 核心功能区 SHALL 显示「edge.env 配置」导航项
- **AND** 点击后跳转到 `/edge-env`

#### Scenario: 通过 cluster_id 打开特定集群的配置
- **WHEN** 用户访问 `/edge-env?cluster_id=1`
- **THEN** 页面 SHALL 加载集群的活跃节点列表，默认选中第一个活跃节点
- **AND** 自动从选中的节点读取 edge.env 内容
- **AND** 页面顶部 SHALL 显示当前集群名称和节点选择器

#### Scenario: 未指定 cluster_id
- **WHEN** 用户访问 `/edge-env`（无 cluster_id 参数）
- **THEN** 页面 SHALL 显示集群选择器下拉框
- **AND** 用户选择集群后自动跳转到 `/edge-env?cluster_id={id}`

#### Scenario: 无活跃节点时显示提示
- **WHEN** 集群下没有任何活跃节点
- **THEN** 页面 SHALL 显示提示"当前集群无活跃节点，无法管理 edge.env"
- **AND** 编辑器和部署按钮 SHALL 置灰

### Requirement: 节点选择与 edge.env 读取

系统 SHALL 提供节点列表接口和 edge.env 读取接口，让用户选择从哪个节点读取配置。

#### Scenario: 页面加载时获取节点列表
- **WHEN** 用户打开 edge.env 页面
- **THEN** 前端 SHALL 调用 `GET /api/v1/clusters/{clusterId}/nodes?status=1&page_size=100` 获取活跃节点列表
- **AND** 节点选择器下拉框 SHALL 显示每个节点的 IP:管理端口
- **AND** 默认选中列表中的第一个节点

#### Scenario: 用户选择节点后读取 edge.env
- **WHEN** 用户从节点选择器中选中一个节点
- **THEN** 前端 SHALL 调用 `GET /api/v1/clusters/{clusterId}/edge-env?node_id={nodeId}` 读取该节点的 edge.env
- **AND** 后端通过 ansible-runner 的 `script` 模块在目标节点上执行 `cat {node.edge_path}/edge.env`
- **AND** 读取成功时返回 `{"node_id": ..., "node_ip": "...", "content": "<完整的 edge.env 文本>"}`

#### Scenario: 切换节点时提示丢弃编辑内容
- **WHEN** 编辑器内容已修改，用户切换节点选择器
- **THEN** 页面 SHALL 弹出确认框"当前编辑内容尚未保存，切换节点将丢弃编辑内容，是否继续？"
- **AND** 用户确认后重新从新节点读取内容

#### Scenario: 指定节点不可达
- **WHEN** 用户选择的节点当前不可达（ansible-runner 连接失败）
- **THEN** 接口 SHALL 返回 HTTP 502 和 `{"detail": "节点 {ip} 无法连接"}`
- **AND** 前端 SHALL 提示用户选择其他节点

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

### Requirement: 部署 edge.env

系统 SHALL 提供接口 `POST /api/v1/clusters/{clusterId}/edge-env/deploy` 将编辑后的 edge.env 部署到集群所有活跃节点。

#### Scenario: 部署请求格式
- **WHEN** 用户点击"部署"按钮
- **THEN** 前端 SHALL 发送请求 `POST /api/v1/clusters/{clusterId}/edge-env/deploy`
- **AND** 请求体 SHALL 包含 `{"content": "<完整的 edge.env 文本>"}`

#### Scenario: 后端 YAML 语法校验
- **WHEN** 后端收到部署请求
- **THEN** 后端 SHALL 对 content 做 YAML 语法校验
- **AND** 若 YAML 格式错误，SHALL 返回 HTTP 422
- **AND** 响应体 SHALL 包含错误行号和错误描述

#### Scenario: YAML 校验通过后开始部署
- **WHEN** YAML 校验通过
- **THEN** 后端 SHALL 逐个遍历集群的活跃节点，串行执行部署
- **AND** 对每个节点执行的步骤：
  1. 备份远端 `edge.env` → `edge.env.bak.{timestamp}`
  2. 通过 `ansible.builtin.copy` 的 `content` 参数写入新 edge.env
  3. 执行 `cd {node.edge_path} && bin/edge init`
  4. 执行 `cd {node.edge_path} && bin/edge reload`

#### Scenario: 部署内容通过 content 参数传递
- **WHEN** ansible-runner 执行 `edge_init_env` tag
- **THEN** 后端 SHALL 将 edge.env 文本内容作为 extravar `env_content` 传入
- **AND** playbook 中 SHALL 使用 `ansible.builtin.copy` 的 `content` 参数写入远端文件
- **AND** SHALL NOT 在 master 服务器创建临时文件

#### Scenario: 全部节点部署完成
- **WHEN** 所有节点部署完成
- **THEN** 后端 SHALL 返回每个节点的执行状态
- **AND** 整体状态标记为 `all_success`、`partial` 或 `all_failed`

#### Scenario: 部分节点部署失败
- **WHEN** 部分节点部署失败
- **THEN** 整体部署状态 SHALL 标记为 `partial`
- **AND** 继续部署剩余节点，不中断整个流程

### Requirement: SSE 实时部署日志

部署过程 SHALL 通过 SSE 推送实时日志，每个节点串行执行，日志按节点分组。

#### Scenario: SSE 端点返回流式日志
- **WHEN** 部署开始
- **THEN** 后端 SHALL 通过 SSE endpoint `GET /api/v1/clusters/{clusterId}/edge-env/deploy/logs?task_id={taskId}` 推送日志
- **AND** 每条日志事件格式：`{"node": "<ip>", "step": "backup|write|init|reload", "status": "running|success|failed", "message": "..."}`
- **AND** 节点切换时推送事件：`{"node": "<ip>", "step": "node_start", "message": "开始部署节点 <ip>"}`

#### Scenario: 日志按节点分组展示
- **WHEN** 前端收到 SSE 日志事件
- **THEN** 部署进度弹窗 SHALL 按节点分组展示，每个节点一张卡片
- **AND** 卡片内展示该节点的各步骤状态（running/success/failed）
- **AND** 已完成步骤显示绿色对勾，当前步骤显示旋转动画，失败步骤显示红色叉号

#### Scenario: 串行部署，逐节点推送
- **WHEN** 集群有多个节点
- **THEN** 系统 SHALL 串行部署每个节点
- **AND** 上一个节点部署完成后才开始下一个节点
- **AND** SSE 依次推送每个节点的完整日志

### Requirement: Diff 对比

部署前 SHALL 展示当前运行配置与待部署配置的差异。

#### Scenario: 部署确认弹窗显示 diff
- **WHEN** 用户点击"部署"按钮
- **THEN** 前端 SHALL 在编辑器的当前内容与最近一次读取/部署的内容之间生成行级 diff
- **AND** 显示确认弹窗，diff 内容使用统一的 diff 组件（新增行绿色高亮、删除行红色高亮、修改行显示前后对比）

#### Scenario: 无变更时提示
- **WHEN** 编辑内容与最近一次读取/部署的内容相同
- **THEN** diff 显示"无变更"
- **AND** "部署"按钮 SHALL 仍然可用（允许强制重新部署）

### Requirement: 版本管理

系统 SHALL 记录每次部署的版本历史。

#### Scenario: 部署完成后创建版本记录
- **WHEN** 部署完成
- **THEN** 系统 SHALL 创建 `EdgeEnvVersion` 记录，包含：
  - 部署的完整 edge.env 内容（content）
  - 部署前的 edge.env 内容（previous_content，用于 diff）
  - 部署时间和部署人
  - 各节点的执行结果（node_results）
  - 整体状态（status）

#### Scenario: 查看版本历史列表
- **WHEN** 用户点击"版本历史"按钮
- **THEN** 页面 SHALL 以列表展示历史版本（时间、部署人、状态标签）
- **AND** 默认按部署时间倒序排列

#### Scenario: 查看版本详情
- **WHEN** 用户点击某个版本记录
- **THEN** 页面 SHALL 展示该版本的完整 edge.env 内容（只读模式）
- **AND** SHALL 展示与上一个版本之间的 diff 对比

#### Scenario: 回滚到历史版本
- **WHEN** 用户在版本历史中点击"回滚"
- **THEN** 系统 SHALL 将该版本的内容填入编辑器
- **AND** SHALL NOT 自动部署，用户需要确认后手动点击"部署"

### Requirement: 部署状态持久化

部署结果 SHALL 在页面刷新后仍然可查。

#### Scenario: 页面刷新后保留部署状态
- **WHEN** 部署进行中用户刷新页面
- **THEN** 最新的部署记录仍然可以在版本历史中查看
- **AND** 未完成的部署记录 status 标记为 `interrupted`

### Requirement: 编辑提示与确认

编辑器 SHALL 在特定情况下提示用户。

#### Scenario: 编辑器内容未保存时刷新提示
- **WHEN** 编辑器内容已修改但未部署，用户尝试刷新页面或切换集群
- **THEN** 页面 SHALL 提示"当前编辑内容尚未部署，确定要离开吗？"

#### Scenario: 刷新内容时确认
- **WHEN** 编辑器内容已修改，用户点击"刷新"按钮
- **THEN** 系统 SHALL 弹出确认"当前编辑内容将被丢弃，确定要刷新吗？"
