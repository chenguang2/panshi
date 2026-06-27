# 节点管理

## Purpose

提供独立的全局节点管理能力，运维人员可跨集群查看和管理所有 Edge 网关节点，支持节点列表查看、筛选搜索、CRUD、启动/停止/状态查询等运维操作，以及数据库配置对比功能。

## Requirements

### Requirement: 全局节点列表查看

系统 SHALL 提供独立的全局节点管理页面，展示所有集群的 Edge 网关节点。

#### Scenario: 用户访问节点管理页面
- **WHEN** 用户点击侧边栏"节点管理"导航或访问 `/nodes` 路由
- **THEN** 系统展示全局节点列表，包含所有集群的全部节点

#### Scenario: 全局列表包含集群名称
- **WHEN** 系统渲染节点列表
- **THEN** 每一行显示节点所属集群的名称

### Requirement: 表格列定义

节点列表表格 SHALL 包含以下列：选择框、IP、所属集群、服务端口、管理端口、Edge路径、状态、Edge版本、操作。

#### Scenario: Nginx列改为Edge版本
- **WHEN** 系统渲染节点列表表格
- **THEN** 原来显示 Nginx 状态的列改为显示 Edge 版本，字段来源为 status_detail.statistic.edge_version
- **AND** 若节点未执行过状态查询导致版本信息缺失，显示 "-"

#### Scenario: 去掉心跳时间列
- **WHEN** 系统渲染节点列表表格
- **THEN** 不包含心跳时间（last_heartbeat）列

### Requirement: 集群筛选

页面顶部 SHALL 提供集群筛选下拉框，默认选中"全部集群"。

#### Scenario: 全部集群筛选
- **WHEN** 用户选择"全部集群"
- **THEN** 系统显示所有集群的节点

#### Scenario: 按集群筛选
- **WHEN** 用户从下拉框选择特定集群
- **THEN** 系统仅显示该集群下的节点

#### Scenario: 集群筛选默认值
- **WHEN** 用户首次进入节点管理页面
- **THEN** 集群筛选下拉框默认显示"全部集群"

### Requirement: 状态筛选

页面 SHALL 提供状态筛选下拉框，选项为全部状态、运行中、已停止。

#### Scenario: 全部状态
- **WHEN** 用户选择"全部状态"
- **THEN** 系统显示所有状态的节点

#### Scenario: 按运行中筛选
- **WHEN** 用户选择"运行中"
- **THEN** 系统仅显示 status=1 的节点

#### Scenario: 按已停止筛选
- **WHEN** 用户选择"已停止"
- **THEN** 系统仅显示 status=0 的节点

### Requirement: 节点详情查看

系统 SHALL 支持查看节点详情，展示节点属性及所在集群的统计数据。

#### Scenario: 查看节点详情
- **WHEN** 用户点击某节点的"详情"按钮
- **THEN** 弹出详情 Modal，展示节点属性（IP、所属集群、服务端口、管理端口、Edge路径、节点状态、创建时间）
- **AND** 展示节点所在集群的统计卡片（路由数、上游数、插件数、全局规则数、插件元数据、静态资源数）

### Requirement: 搜索节点

页面 SHALL 提供搜索输入框，支持按 IP 地址和名称搜索节点。

#### Scenario: 按IP搜索
- **WHEN** 用户在搜索框输入 IP 地址
- **THEN** 系统筛选出 IP 匹配的节点

#### Scenario: 按名称搜索
- **WHEN** 用户在搜索框输入节点名称
- **THEN** 系统筛选出名称匹配的节点

### Requirement: 添加节点

系统 SHALL 支持通过弹窗表单添加节点，表单包含所属集群下拉框。

#### Scenario: 添加节点弹窗包含所属集群
- **WHEN** 用户点击"添加节点"按钮
- **THEN** 弹出添加节点弹窗，表单包含以下字段：IP地址（必填）、所属集群（下拉框，必选）、服务端口、管理端口、Edge路径、启用开关
- **AND** "所属集群"下拉框列出所有可用集群供选择

#### Scenario: 添加节点成功
- **WHEN** 用户填写完整信息并提交
- **THEN** 系统创建节点并刷新列表
- **AND** 显示成功提示

#### Scenario: Edge路径格式校验
- **WHEN** 用户输入的 Edge 路径不以 `/` 开头
- **THEN** 系统提示错误："Edge路径必须以 / 开头"
- **AND** 阻止提交

### Requirement: 节点操作

系统 SHALL 支持对节点执行启动、停止、状态查询操作，以及通过更多菜单执行编辑、删除、数据库对比。

#### Scenario: 启动节点
- **WHEN** 用户点击某节点的"启动"按钮
- **THEN** 系统弹出确认对话框
- **AND** 确认后执行节点启动操作
- **AND** 展示操作执行过程 Drawer

#### Scenario: 停止节点
- **WHEN** 用户点击某节点的"停止"按钮
- **THEN** 系统弹出确认对话框
- **AND** 确认后执行节点停止操作
- **AND** 展示操作执行过程 Drawer

#### Scenario: 状态查询
- **WHEN** 用户点击某节点的"状态查询"按钮
- **THEN** 系统执行节点状态查询
- **AND** 展示状态查询结果 Drawer，包含 Edge 版本、CPU/内存使用率等信息

#### Scenario: 启动节点成功后状态自动同步
- **WHEN** 用户点击"启动"且命令执行成功
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 停止节点成功后状态自动同步
- **WHEN** 用户点击"停止"且命令执行成功
- **THEN** `node.status` SHALL 被设为 0（停用）

#### Scenario: 重启节点成功后状态自动同步
- **WHEN** 用户点击"重启"且命令执行成功
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 配置检查成功后不更新状态
- **WHEN** 用户点击"检测"且 `nginx -t` 配置检查成功
- **THEN** `node.status` SHALL NOT 被修改（配置检查不代表进程状态）
- **AND** `node.status_detail` 仍被更新

#### Scenario: 状态查询发现 nginx 运行中
- **WHEN** 用户点击"状态查询"且命令执行成功，解析到 `nginx_running=True`
- **THEN** `node.status` SHALL 被设为 1（正常）

#### Scenario: 状态查询发现 nginx 未运行
- **WHEN** 用户点击"状态查询"且命令执行成功，解析到 `nginx_running=False` 且 `nginx_status != "unknown"`
- **THEN** `node.status` SHALL 被设为 0（停用）

#### Scenario: 状态查询返回不可解析结果
- **WHEN** 用户点击"状态查询"且命令执行成功，但 `_parse_nginx_status` 返回 `nginx_status="unknown"`
- **THEN** `node.status` SHALL NOT 被修改（不可解析不代表 nginx 实际状态）

#### Scenario: 任何操作失败不更新状态
- **WHEN** 用户执行任意节点操作且命令执行失败（SSH 不通、返回码非零等）
- **THEN** `node.status` SHALL NOT 被修改
- **AND** `node.status_detail` 仍被更新以记录失败信息

#### Scenario: 编辑节点
- **WHEN** 用户在更多菜单点击"编辑"
- **THEN** 弹出编辑节点弹窗，预填当前节点信息
- **AND** 用户修改后提交，系统更新节点并刷新列表

#### Scenario: 删除节点
- **WHEN** 用户在更多菜单点击"删除"
- **THEN** 弹出删除确认对话框，包含数据库和 Edge 节点删除选项
- **AND** 确认后执行删除

#### Scenario: 数据库对比
- **WHEN** 用户在更多菜单点击"数据库对比"
- **THEN** 打开配置对比 Drawer，展示该节点上配置与本地数据库的差异

### Requirement: 分页

节点列表 SHALL 支持分页展示。

#### Scenario: 分页浏览节点
- **WHEN** 节点总数超过每页显示数量（默认20条）
- **THEN** 表格底部显示分页控件
- **AND** 用户可通过分页控件切换页面

### Requirement: 权限过滤

系统 SHALL 根据当前用户的权限过滤节点列表。非管理员用户只能看到自己有权限的集群的节点。

#### Scenario: 管理员查看全部节点
- **WHEN** 管理员用户访问节点管理页面
- **THEN** 系统显示所有集群的全部节点

#### Scenario: 非管理员查看受限节点
- **WHEN** 非管理员用户访问节点管理页面
- **THEN** 系统仅显示该用户有权限的集群的节点

### Requirement: 后端全局节点列表API

系统 SHALL 提供 `GET /nodes` API，返回所有集群的节点列表。

#### Scenario: 全局节点列表查询
- **WHEN** 前端发送 `GET /api/v1/nodes` 请求
- **THEN** 后端返回所有集群的节点列表，包含 cluster_name 字段
- **AND** 支持 page、page_size、search、cluster_id、status 参数

#### Scenario: 按集群筛选
- **WHEN** 前端发送 `GET /api/v1/nodes?cluster_id=1` 请求
- **THEN** 后端仅返回集群ID为1的节点

#### Scenario: 搜索节点
- **WHEN** 前端发送 `GET /api/v1/nodes?search=10.0.0` 请求
- **THEN** 后端返回 IP 匹配的节点

### Requirement: 侧边栏导航

左侧导航栏 SHALL 包含"节点管理"入口。

#### Scenario: 节点管理导航项
- **WHEN** 系统渲染侧边栏
- **THEN** 核心功能区域显示"节点管理"导航项
- **AND** 图标使用设计稿中的三点连接图标

### Requirement: 安装操作受特性配置控制（独立控制）

节点更多菜单中的"安装 OpenResty"和"安装 Edge"按钮 SHALL 各自独立受 `install_openresty` 和 `install_edge` 特性控制。

#### Scenario: 安装 OpenResty 启用
- **WHEN** `features.yaml` 中 `install_openresty` 为 `true`
- **THEN** 节点行更多菜单中 SHALL 显示"安装 OpenResty"菜单项
- **AND** 集群节点 Tab 的"安装"下拉按钮中 SHALL 显示"安装 OpenResty"
- **AND** `POST /clusters/{id}/nodes/{nid}/install-openresty` SHALL 可用
- **AND** `POST /clusters/{id}/nodes/{nid}/cancel-install` SHALL 可用

#### Scenario: 安装 OpenResty 禁用
- **WHEN** `features.yaml` 中 `install_openresty` 为 `false`
- **THEN** "安装 OpenResty"菜单项 SHALL NOT 显示
- **AND** `POST /clusters/{id}/nodes/{nid}/install-openresty` SHALL 返回 404
- **AND** `POST /clusters/{id}/nodes/{nid}/cancel-install` SHALL 返回 404
- **AND** "安装 Edge"按钮和行为 SHALL 不受影响

#### Scenario: 安装 Edge 启用
- **WHEN** `features.yaml` 中 `install_edge` 为 `true`
- **THEN** 节点行更多菜单中 SHALL 显示"安装 Edge"菜单项
- **AND** 集群节点 Tab 的"安装"下拉按钮中 SHALL 显示"安装 Edge"
- **AND** `POST /clusters/{id}/nodes/{nid}/install-edge` SHALL 可用

#### Scenario: 安装 Edge 禁用
- **WHEN** `features.yaml` 中 `install_edge` 为 `false`
- **THEN** "安装 Edge"菜单项 SHALL NOT 显示
- **AND** `POST /clusters/{id}/nodes/{nid}/install-edge` SHALL 返回 404
- **AND** "安装 OpenResty"按钮和行为 SHALL 不受影响
