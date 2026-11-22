# Tasks: page-header-stat-badges

## 1. 口径与设计页

- [x] 1.1 盘点：设计页 16/16 有页头徽标，实现 4/16（节点/上游/路由/统一管理）；确认缺失 11 页
- [x] 1.2 用户裁决：补 11 页、概览不加、统一管理改「N 分组 · M 节点」
- [x] 1.3 `central.html` 示例值改「4 分组 · 31 节点」；`overview.html` 删除标题旁 `ph-inline`

## 2. 实现侧

- [x] 2.1 `ClusterList.vue`：分组数 + 节点数
- [x] 2.2 `StreamProxyList.vue`：集群数 + 目标总数
- [x] 2.3 `DnsUdpProxyList.vue` / `DnsQueryList.vue`：集群数 + 域名总数（`dnsDomains` / `domains`）
- [x] 2.4 `PluginConfigList.vue`：集群数 + 插件项总数
- [x] 2.5 `PluginMetadataList.vue`：集群数 + 去重插件数
- [x] 2.6 `PluginSwitches.vue`：分类数 + 引用处数（`refs` 三项之和）
- [x] 2.7 `GlobalRuleList.vue`：集群数 + 部分失败规则数（bad 色）
- [x] 2.8 `StaticResourceList.vue`：集群数 + 资源总量（0 时 `—`）
- [x] 2.9 `CaCertList.vue`：即将过期 + 已过期（`expire_days`，null 不计）
- [x] 2.10 `ServerCertList.vue`：集群数 + 已过期（仅非 CA 证书）
- [x] 2.11 `CentralList.vue`：由「N 集群 · M 节点」改为「N 分组 · M 节点」

## 3. 守卫与验证

- [x] 3.1 `pageHeaderActions.source.test.ts` 新增「设计页 `ph-inline` ⟺ 实现 `PageStatBadges`」14 对 + 概览反向断言（共 15 条）
- [x] 3.2 `npx vue-tsc -b` 干净
- [x] 3.3 真机 1600 视口 12 页徽标文本核对（`/tmp/opencode/parity-central/check-badges.mjs`）：central 5 分组·40 节点 / clusters 5·40 / stream 6·18 目标 / dns-udp 5·11 域名 / dns-http 4·9 域名 / plugin-groups 6·30 插件 / plugin-metadata 8·4 插件 / plugin-switches 5 分类·213 处引用 / global-rules 5·1 节点同步失败 / static-resources 3·18.6 MB / ca 0·0 / server 4·1 / dashboard 无
- [x] 3.4 全量 vitest `--maxWorkers=4`：3258 passed / 2 failed（`SslGenerateDialog`、`AnsibleInventory` 未改动文件，隔离复跑 28/28 绿 → #58 波动）
- [x] 3.5 `openspec validate --all` 0 error
