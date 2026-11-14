# Design

## Context

三类载荷构造（publish 端点现文）：
- **SSL**（cluster_ssl.py）：config_data 含 name/type/sni/cert/key 等字段 + 国密分支（certs/keys/gm/cert_chain/client）+ `edge_data = config_data`（同体）；发布 `post_version_hook=_apply_cert_chain` 在**快照之后**给 config_data["cert"] 追加 CA 链（cert_ca_id 关联时），即实发 = 快照 + 拼接。私钥脱敏：DRIFT_TYPE_REGISTRY["ssl"] 已有 mask {key, private_key}。
- **四层代理**（cluster_stream_proxies.py）：edge_body = {server_port, upstream:{nodes,type,scheme,hash_on?,key?,retries?,retry_timeout?,checks?}, protocol?, sni?, remote_addr?, name?}；config_data = StreamProxyResponse.model_dump()。
- **DNS 代理**（cluster_dns_proxies.py）：edge_body = {server_port, name, protocol?, plugins=build_dns_plugins(dns_config, checks)}（#18：DNS 含 dns_config/checks 全量语义）；config_data 同为 StreamProxyResponse dump。两者共用 StreamProxy 表、发布留痕同为 resource_type="stream_proxy"。

入口现状：SslCertCard（server variant 卡片头 meta 行有 PublishStatusTag，卡片操作全 emit、业务留页面——按钮经 emit 上抛）；StreamProxyList/DnsUdpProxyList 行内已有 PublishStatusTag；真实环境存在 SSL ⚠ partial 行（证书「qcg」）。

## Goals / Non-Goals

**Goals:**
- 七类全覆盖：三类 builder + publish 端点同源改调 + 守卫扩展
- SSL 证书链拼接双语义正确（候选=实发；基线镜像展开消噪）
- 双键注册表（stream_proxy/dns_proxy）共享快照类型映射

**Non-Goals:**
- CA 根证书（分发不经统一发布编排，卡片无状态标签）
- SSL 查看抽屉 / 四层 DNS 查看抽屉按钮（D4：列表行为主入口）
- 漂移检测其他类型的既有语义改动

## Decisions

**D1 SSL 候选 = 实发（含拼接），基线镜像展开消噪。**
`_build_ssl_candidate(db, cert)`：复刻 config_data 构造 + 复刻 _apply_cert_chain 的**载荷变换部分**（cert 字段追加 CA 链、国密 cert_chain 字段）；跳过其中的 openssl 过期检查（发布期守卫，非载荷构造）。注册表新增可选钩子 `expand_baseline(db, resource, payload) -> payload`：SSL 实现为对基线快照按当前 CA 关联做同一拼接镜像——漂移基线与预览 platform_change 的基线经此展开后，拼接本身不再产生恒定噪声差异；证书内容真变更仍正常报出。漂移检测消费同一钩子（与 plugin_metadata normalize 修复同类：基线必须变换到与实发/节点同形态再比）。注意钩子内部不再触发 HTTPException（预览/漂移只读，CA 过期检查仅属发布动作）。

**D2 双键注册表 + 快照类型映射。**
注册表条目新增可选 `snapshot_resource_type`（缺省 = 注册表键）：`stream_proxy` 键 → 快照 stream_proxy；`dns_proxy` 键 → 快照 stream_proxy。两者 edge_key 均为 stream_route（采集共享）；build_candidate 各自复刻各域 publish 构造。预览服务快照查询与漂移检测快照查询处按映射取类型（漂移检测本就以 stream_proxy 查询，行为不变）。

**D3 SSL 按钮显隐与全域一致（D3 勘误落定）。**
SslCertCard 已透传 last_publish_status（publish-status-unify 批 2），真实环境存在 ⚠ partial 证书——按钮显隐沿用共享组件两态判定（pending||partial），SSL 无需特判。证书链拼接与显隐无交互（拼接是载荷构造语义，不是状态语义）。主 spec ssl-certificate-management「三态不接 partial」表述与现行代码不一致，归档 publish-status-unify 时同步（本变更不碰该 spec）。

**D4 前端接线。**
- SslCertCard：meta 行 PublishStatusTag 旁加 PublishDiffButton（server variant），`@click.stop` emit `preview-diff`（cert 上抛）；ServerCertList 挂 PublishPreviewModal（clusterId = cert.cluster_id，resourceName = cert.name）；CaCertList 不挂（CA variant 无标签自然无按钮）。
- StreamProxyList/DnsUdpProxyList：行状态标签旁按钮（status-cell-flex），弹窗 resourceType 分别 stream_proxy/dns_proxy，「去发布」回接各页既有发布流程。
- RESOURCE_LABELS 补 ssl→SSL 证书 / stream_proxy→四层代理 / dns_proxy→DNS 代理。

**D5 测试与守卫。**
- 后端：三类 builder 单测（SSL 链拼接/国密分支、stream/dns edge_body 形态）；预览用例（SSL 候选含拼接 + 拼接不进 platform_change 噪声、dns_proxy 键 404/快照映射正确、400 静态资源）；漂移 ssl 链噪声修复回归（单节点证书未变更不报漂移）；守卫 +3 域。
- 前端：consumers 守卫扩 3 文件；SslCertCard 按钮显隐/emit 用例。
- 回归：`pytest -k "ssl or stream or dns or publish or drift"`；全量收口；真实页面验收（SSL 用「qcg」真实 partial 行，四层/DNS 用既有待发布行）。

## Risks / Trade-offs

- **SSL 发布主链路改造 + post_version_hook 语义**：builder 复刻拼接时若与 hook 将来演进不同步会出现两套口径——守卫测试钉 publish 端点必须走 builder，且 builder 注释互指 hook；hook 变更时两处同步（同文件近距离）。
- **expand_baseline 依赖当前 CA 关联**：基线拼接按当前 ca_cert_id 镜像，若发布后更换了 CA，镜像拼的是新 CA 链——与「实发时拼的是当时 CA」存在偏差；该偏差仅在 platform_change/漂移的基线侧，证书内容本体差异仍如实报出，可接受（文档注明）。
- **dns_proxy 双键共用快照**：回滚/版本等既有功能仍按 stream_proxy 快照类型工作，不受预览双键影响（只读查询带映射，无写路径）。
