## ADDED Requirements

### Requirement: DNS 代理独立列表视图
系统 SHALL 在 `/stream-proxies?type=dns` 提供 DNS 代理视图，仅展示 `proxy_type=dns` 的代理。页面布局与现有四层代理列表一致，支持搜索、分组筛选、集群筛选、卡片展示、CRUD、发布、版本管理。

#### Scenario: 列表加载
- **WHEN** 用户点击侧边栏"DNS代理"
- **THEN** 页面 SHALL 调用 `GET /api/v1/stream-proxies?proxy_type=dns`
- **AND** 每张卡片显示端口、DNS 域名映射列表、类型、TTL
- **AND** PageHeader 标题显示"DNS 代理"
