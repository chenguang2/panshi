# relay-region-registry Delta

## MODIFIED Requirement: 全局总开关

### Requirement: 全局总开关
系统 SHALL 提供 `features.yaml` 的 `features.relay_gateway` 作为全局总开关（显式 opt-in，默认 `false`，不沿用 features.yaml 的"未列出即启用"约定）。关闭时：① 所有区域一律按直连路径执行，无论区域配置如何；② 中继区域管理面整体不可用——侧边栏菜单项隐藏（条目 `feature` 门）、前端 `/relay-gateways` 路由不注册（`featureRouteMap` 动态注册）、后端 `/relay` 全部端点返回 404「中继网关功能未启用」（`_require_relay_feature` 端点级 router dependency，请求期实时检查）。权限依赖 SHALL 先于总闸解析：无 `relay_gateway` 权限者得 403，404 不泄露模块存在性。该开关经 `app.core.features` 的 mtime 热加载读取，执行路径与上述管理面三层 SHALL 全部改完即时生效、无需重启。

#### Scenario: 一键回退
- **WHEN** `features.yaml` 中 `relay_gateway: false`
- **THEN** 所有节点通道寻址按现状直连路径执行，行为与本变更合入前一致

#### Scenario: 开关热生效
- **WHEN** 管理员将 `features.yaml` 的 `relay_gateway` 由 `false` 改为 `true`
- **THEN** 无需重启后端，后续寻址即按区域网关路径（HTTP `X-Edge-Target` / SSH `-J`）执行

#### Scenario: 关闭时管理面不可用
- **WHEN** `features.yaml` 中 `relay_gateway: false`（不重启进程）
- **THEN** 侧边栏「中继区域管理」菜单项隐藏、`/relay-gateways` 路由不注册（直达 URL 不可达）、持 `relay_gateway` 权限者调用 `/relay` 端点得 404「中继网关功能未启用」

#### Scenario: 无权限者先于总闸得 403
- **WHEN** 用户无 `relay_gateway` 权限且总闸关闭，请求 `/relay` 端点
- **THEN** 返回 403（权限依赖先解析），不以 404 泄露模块存在性判定
