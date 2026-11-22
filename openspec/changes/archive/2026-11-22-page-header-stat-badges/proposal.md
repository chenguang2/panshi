# Proposal

## Why

页头统计徽标（`.ph-inline > .ph-lite`，组件 `PageStatBadges`）在设计基线里是**每页都有**的补充信息：16 张 `proposal-c` 设计页的标题旁都画了 1–2 枚胶囊。但实现侧只有 4 页接了（节点管理 / 上游管理 / 路由管理 / 统一管理），其余 11 页（集群管理、四层代理、DNS 代理 ×2、插件组、插件元数据、插件开关、全局规则、静态资源、CA 根证书、服务器证书）都缺失。

原因不是按页取舍，而是落地批次：`PageStatBadges` 是 list-pages-console-restyle 那一轮为「节点/上游/路由 + 统一管理」建的；后续卡片页与证书页改版复用了面板壳和卡片解剖，页头徽标没接，也没有守卫盯着，于是漏成了长期差异。

同时暴露两处口径问题：

1. **统一管理**的「N 集群」与状态 chips「全部 N」是同一个数字，违背 #86② 的「页头只放补充维度」；设计页原本也这么画（`8 集群 / 31 节点`），实现照抄。
2. **概览页**的「8 集群 / 31 节点」与页面 4 张统计卡重复，同一组数字出现三次。

## What Changes

- **补齐 11 页页头徽标**，取值全部按对应设计页：集群管理（分组 / 节点）、四层代理（集群 / 目标）、DNS-UDP 与 DNS-HTTP（集群 / 域名）、插件组（集群 / 插件项）、插件元数据（集群 / 去重插件）、插件开关（分类 / 引用处数）、全局规则（集群 / 节点同步失败）、静态资源（集群 / 总量）、CA 根证书（即将过期 / 已过期）、服务器证书（集群 / 已过期）。
- **统一管理改为「N 分组 · M 节点」**（分组是 chips 没有的维度），并同步设计页 `central.html` 的示例值。
- **概览页不放页头徽标**：从 `overview.html` 删掉标题旁的 `ph-inline`（实现本就没有），数字由页内统计卡承担。
- **加守卫**：`pageHeaderActions.source.test.ts` 增加「设计页 header 有 `ph-inline` ⟺ 实现有 `PageStatBadges`」逐页断言（14 对 + 概览反向断言），防止再次漏接。

## Capabilities

### New Capabilities

- `page-header-stat-badges`：页头统计徽标的唯一口径——只放补充维度、不重复状态 chips 的总数、每页与设计页一一对应、无数据时降级而不是编数。

## Impact

- 前端：11 个页面视图（`ClusterList` / `StreamProxyList` / `DnsUdpProxyList` / `DnsQueryList` / `PluginConfigList` / `PluginMetadataList` / `PluginSwitches` / `GlobalRuleList` / `StaticResourceList` / `CaCertList` / `ServerCertList`）加 `#stats` 槽 + `PageStatBadges` + `headerStatItems`；`CentralList` 改口径。
- 设计页：`central.html` 示例值改「4 分组」；`overview.html` 删页头徽标。
- 测试：`pageHeaderActions.source.test.ts` 增 15 条徽标一致性断言。
- 后端：零改动（全部前端聚合，数据来自各页已加载的列表与既有字段 `expire_days` / `file_size` / `refs` / `last_publish_status`）。
