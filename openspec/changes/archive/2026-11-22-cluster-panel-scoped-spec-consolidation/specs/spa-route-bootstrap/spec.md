# spa-route-bootstrap

## Purpose

SPA 启动期的路由兜底：特征开关路由在功能配置加载后才注册，期间不得产生「路由未匹配」告警或错误页面闪现；未知地址给出明确空态。

## ADDED Requirements

### Requirement: 启动期路由占位

应用 SHALL 在静态路由表末尾注册一个 catch-all 占位路由（`BootstrapPlaceholder`），使首次导航在任何地址上都能解析；它 SHALL NOT 抢占静态路由、动态注册的特征路由或深链。

#### Scenario: 首次导航不产生未匹配告警
- **WHEN** 用户直接访问一个特征开关页面地址（如 `/edge-client`、`/database-management`、`/edge-import`、`/tools`）
- **THEN** 启动期控制台 SHALL NOT 出现 `No match found for location with path ...` 告警
- **AND** 功能配置加载完成后 SHALL 导航到真实页面

#### Scenario: 占位不覆盖真实路由
- **WHEN** 访问任意静态页面、深链（如 `/routes?cluster_id=4`）或已注册的特征页面
- **THEN** 解析结果 SHALL 是对应真实路由，而非 `BootstrapPlaceholder`

#### Scenario: 占位期间不闪现空态
- **WHEN** 功能配置仍在加载（含失败重试期间）
- **THEN** 占位视图 SHALL NOT 呈现「页面不存在或功能未启用」文案

### Requirement: 未知地址的空态

功能配置加载完成且重导航结束后，仍未匹配的地址 SHALL 显示明确空态，而非空白页面。

#### Scenario: 未知路径显示空态
- **WHEN** 用户在启动完成后访问不存在的路径
- **THEN** 页面 SHALL 显示「页面不存在或功能未启用」标题、说明文案与「返回概览」按钮
- **AND** 点击按钮 SHALL 导航到 `/`

#### Scenario: 功能关闭的页面同样落到空态
- **WHEN** 访问一个在当前部署中已被开关关闭的特征页面
- **THEN** 页面 SHALL 显示同一空态（说明文案含「该功能在当前部署中已关闭」语义）
