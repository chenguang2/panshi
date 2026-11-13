# Proposal

## Why

发布差异预览已接入五类资源（上游、路由、插件组、全局规则、插件元数据；十入口 = 表格行 4 + 卡片 6）。剩两类经统一发布编排的资源未接入：SSL 证书（卡片 UI）与四层/DNS 代理（同表双载荷形态）。本批接完后，全部经统一发布编排的资源类型均可预览。批 2 两项设计裁决（2026-11-13 用户确认）：SSL 卡片入口 = 状态标签旁 ▾（D2，与全站同款）；SSL 按钮显隐 = 待发布 + partial 两态（D3 勘误后与其余类型一致——SSL 的 partial 已随 publish-status-unify 批 2 实际接线，真实环境存在 ⚠ partial 证书）；四层/DNS 查看抽屉不加按钮，列表行为主入口（D4）。

## What Changes

- 候选载荷构造单点扩展 3 键：
  - `ssl`：服务器证书（config_data 与 edge_data 同体；**必须复刻发布 post_version_hook 的证书链拼接**——CA 签发的证书实发 cert 字段 = 服务器证书 + CA 链，不含拼接的候选与实发不一致；私钥脱敏走既有 mask）
  - `stream_proxy`：四层代理 TCP 形态（edge_body = {server_port, upstream{nodes/type/scheme/hash_on/retries/checks}, protocol, sni, remote_addr, name}）
  - `dns_proxy`：DNS 代理形态（edge_body = {server_port, name, protocol, plugins=build_dns_plugins(dns_config, checks)}）——与 stream_proxy 共用 StreamProxy 表与 `stream_proxy` 快照类型，注册表以快照类型映射支持双键
- 对应 3 个 publish 端点（cluster_ssl / cluster_stream_proxies / cluster_dns_proxies）内联载荷构造移除、改调共享单点；源码守卫逐域扩展。
- 注册表新增可选 `expand_baseline` 钩子（SSL 证书链镜像拼接）：漂移检测基线与预览 platform_change 的基线快照按实发变换镜像展开，消除「CA 链拼接」在单节点漂移与平台侧变更段的恒定噪声（与 plugin_metadata normalize 缺陷同类的潜伏问题，一并修复）。
- 前端 3 个入口接入：SSL 服务器证书卡片（SslCertCard 状态标签旁 ▾，ServerCertList 挂弹窗；CA 根证书页不接——CA 分发不经统一发布编排，卡片亦无状态标签）、StreamProxyList 行、DnsUdpProxyList 行（查看抽屉不接）；弹窗 resourceType/labels 扩至 8 键。
- 按钮显隐与其余类型一致：待发布 + partial 两态。

## Capabilities

### New Capabilities

<!-- 无新能力：扩展既有 publish-diff-preview 能力的资源范围与两个类型特定语义。 -->

### Modified Capabilities

- `publish-diff-preview`: ①「入口按钮状态范围」由十入口扩展为全部已接入类型（五类十入口 + SSL 卡片 + 四层/DNS 列表行），并明确卡片与表格形态通用；②「首批范围与类型注册表扩展」由五类扩展为全部七类经统一发布编排的类型（静态资源/节点仍不在范围，400 明示）。

## Impact

- 后端：`publish_preview.py`（+3 build_candidate；注册表支持快照类型映射与 expand_baseline 钩子）；`cluster_ssl.py`、`cluster_stream_proxies.py`、`cluster_dns_proxies.py` 同源改调；`drift_detection.py`（expand_baseline 消费）；守卫与预览测试逐域扩展。
- 前端：`PublishPreviewModal.vue`（类型/labels）；`SslCertCard.vue`（状态标签旁按钮，emit 上抛）；`ServerCertList.vue`、`StreamProxyList.vue`、`DnsUdpProxyList.vue` 接线；consumers 守卫扩展。
- 无模型/列变更；发布主链路 3 处调用侧改造由各域发布测试回归兜底；漂移 ssl 证书链噪声修复由新增回归钉死。
