## MODIFIED Requirements

### Requirement: 页面拆分与 composable 抽取
`stream-proxy-management` 页面从混合展示拆分为通过侧边栏菜单和 `route.query.type` 参数区分 TCP 代理和 DNS 代理，共享逻辑通过 `useStreamProxyList` composable 复用。

#### Scenario: 侧边栏拆分
- **WHEN** 用户查看左侧导航
- **THEN** SHALL 显示"TCP代理"和"DNS代理"两个菜单项
- **AND** 不再显示"四层代理"菜单项

#### Scenario: TCP 代理列表
- **WHEN** 用户点击"TCP代理"
- **THEN** SHALL 导航到 `/stream-proxies?type=normal`
- **AND** 页面只显示 `proxy_type=normal` 的代理
- **AND** 页面标题为"TCP 代理"
- **AND** 新建按钮文案为"+ 新建 TCP 代理"

#### Scenario: DNS 代理列表
- **WHEN** 用户点击"DNS代理"
- **THEN** SHALL 导航到 `/stream-proxies?type=dns`
- **AND** 页面只显示 `proxy_type=dns` 的代理
- **AND** 页面标题为"DNS 代理"
- **AND** 新建按钮文案为"+ 新建 DNS 代理"

#### Scenario: composable 共享逻辑
- **WHEN** 页面执行加载/筛选/CRUD/发布/版本管理操作
- **THEN** 所有逻辑 SHALL 来自 `useStreamProxyList(proxyType)` composable
- **AND** 后端 API 请求 SHALL 携带 `proxy_type` 参数
