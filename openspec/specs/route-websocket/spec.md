# route-websocket

## Purpose

路由级别 WebSocket 代理开关，支持在平台界面开启/关闭。Edge 网关的 Route API 已支持 `enable_websocket` 字段，本能力将其暴露到平台路由管理，使需要 WebSocket 支持的路由可以在平台统一配置，无需通过 Edge 直连 API 手动配置。

## Requirements

### Requirement: Route 支持 WebSocket 代理配置

系统 SHALL 支持在路由中开启 WebSocket 代理支持，通过 `enable_websocket` 字段控制。

#### Scenario: 新建路由时 WebSocket 默认关闭
- **WHEN** 用户打开新建路由表单
- **THEN** "启用 WebSocket" 复选框 SHALL 显示在基础配置页
- **AND** 复选框 SHALL 默认不选中

#### Scenario: 编辑路由时回填 WebSocket 状态
- **WHEN** 用户编辑已有路由
- **AND** 该路由的 `enable_websocket` 为 true
- **THEN** 复选框 SHALL 回填为选中状态
- **AND** 保存时 SHALL 发送 `enable_websocket: true`

#### Scenario: 编辑路由时 WebSocket 已关闭
- **WHEN** 用户编辑已有路由
- **AND** 该路由的 `enable_websocket` 为 false 或未设置
- **THEN** 复选框 SHALL 不选中

#### Scenario: 发布时传递 enable_websocket
- **WHEN** 用户发布路由到 Edge 节点
- **AND** 路由的 `enable_websocket` 为 true
- **THEN** Edge API 请求 body SHALL 包含 `"enable_websocket": true`
- **AND** `enable_websocket` 为 false 时 SHALL 不发送此字段（Edge 按缺省 false 处理）

#### Scenario: 从 Edge 导入时识别 enable_websocket
- **WHEN** 用户从 Edge 节点导入路由
- **AND** Edge 返回的路由数据包含 `enable_websocket` 字段
- **THEN** 系统 SHALL 将该字段值写入数据库
