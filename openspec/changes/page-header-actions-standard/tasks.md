# Tasks: page-header-actions-standard

> 前置：design.md 的 E1–E3 已于 2026-11-21 裁决（E1 为正文级差异、本变更不动；E2/E3 删设计页按钮）。

## 1. 裁决与清单

- [x] 1.1 E1 插件元数据「插件开关」：精确解析后确认它**不是页头按钮**（在正文 alert 里），实现无该链接 → 本变更不动，登记为正文级差异
- [x] 1.2 E2 CA 根证书「查看安装指引」：删设计页按钮（实现已有页内 `<details>` 折叠面板）
- [x] 1.3 E3 服务器证书「添加已有证书」：删设计页按钮（实现无此功能，用户确认不是需求）；横幅「前往 CA 根证书下载 →」两版一致不动
- [x] 1.4 断言反转清单（#217）：`mockupParity.source.test.ts` 的「+ 添加节点」断言 → `<StrokeIcon name="plus" /> 添加节点`；`DnsUdpProxyList.test` 等使用 `includes('新建 …')` 的用例不受影响（已核）

## 2. 实现侧收口

- [x] 2.1 `NodeList.vue`：去 `+ ` 前缀 + `plus` 图标
- [x] 2.2 `UpstreamList.vue` / `RouteList.vue`：去 `+ ` 前缀 + `plus`
- [x] 2.3 `StreamProxyList.vue` / `DnsUdpProxyList.vue` / `DnsQueryList.vue`：去 `+ ` 前缀 + `plus`（批量管理保持无图标）
- [x] 2.4 `PluginConfigList.vue` / `GlobalRuleList.vue` / `PluginMetadataList.vue` / `StaticResourceList.vue`：去 `+ ` 前缀 + `plus`
- [x] 2.5 `CaCertList.vue`：去 `＋ ` 前缀 + `plus`；安装指引保持页内折叠面板
- [x] 2.6 `ServerCertList.vue`：去 inline `margin-left: 8px` + `plus`；动作集只留「生成证书」
- [x] 2.7 `PluginMetadataList.vue`：无「插件开关」页头按钮（维持现状）

## 3. 设计页回填

- [x] 3.1 `static-resources.html` / `plugin-metadata.html`：页头补「批量管理」（secondary、无图标，`aria-pressed=false`）
- [x] 3.2 `ca-certs.html` 删「查看安装指引」；`server-certs.html` 删「添加已有证书」
- [x] 3.3 其余 8 张设计页核对：按钮集/主次/图标与实现一致（`pageHeaderActions.source.test.ts` 逐页数量断言全绿，14 对页面）

## 4. 守卫与回归

- [x] 4.1 新增 `src/views/__tests__/pageHeaderActions.source.test.ts`（70 例）：禁 `+`/`＋` 前缀、primary ≤ 1 且最右、禁 inline margin、禁内联 `<svg>`（图标必须来自 `StrokeIcon`）
- [x] 4.2 同文件第二段：设计页 HTML 与实现页头按钮数量一一对应 + 设计页无前缀（14 对）
- [x] 4.3 `vue-tsc -b` 干净；全量 `vitest --maxWorkers=4` 两轮：首轮 3165 passed / 2 failed（`mockupParity` 两处旧文案断言已反转；`DbBackupRestoreWizard.ux` 单跑 21/21 绿），次轮 3166 passed / 1 failed（`RelayGateways` 单跑 63/63 绿）——均判定 #58 波动；`openspec validate --all` 223 passed / 0 failed
- [x] 4.4 真机 1600 视口逐页 DOM 核对 12 页（`/tmp/opencode/parity-central/check-headers.mjs` 输出 + `hdr-*.png`）：按钮文案/主次/图标/inline margin 全部符合规范；`hdr-nodes.png` 目检通过
