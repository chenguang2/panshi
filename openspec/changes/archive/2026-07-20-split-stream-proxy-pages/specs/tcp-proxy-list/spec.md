## ADDED Requirements

### Requirement: TCP 代理独立列表视图
系统 SHALL 在 `/stream-proxies?type=normal` 提供 TCP 代理视图，仅展示 `proxy_type=normal` 的代理。页面布局与现有四层代理列表一致，支持搜索、分组筛选、集群筛选、卡片展示、CRUD、发布、版本管理。

#### Scenario: 列表加载
- **WHEN** 用户点击侧边栏"TCP代理"
- **THEN** 页面 SHALL 调用 `GET /api/v1/stream-proxies?proxy_type=normal`
- **AND** 每张卡片显示协议(TCP/UDP)、端口、负载均衡算法、目标列表
- **AND** PageHeader 标题显示"TCP 代理"
