# Tasks

## 1. 三类候选载荷构造单点（发布主链路，先行回归）

- [ ] 1.1 RED：test_publish_candidate_single_source.py 扩展三域（cluster_ssl / cluster_stream_proxies / cluster_dns_proxies 的 publish 端点断言 build_candidate + 无内联构造，内联标记分别取 edge_data = config_data / edge_body 字面量），验证失败
- [ ] 1.2 GREEN：publish_preview.py 注册表 +3——ssl（复刻 config_data 构造 + 证书链拼接，跳过 openssl 过期检查）、stream_proxy（TCP edge_body）、dns_proxy（DNS edge_body，build_dns_plugins）；条目支持可选 snapshot_resource_type（dns_proxy → stream_proxy）与可选 expand_baseline 钩子（ssl 镜像拼接）；三个 publish 端点改调共享构造，行为零变化
- [ ] 1.3 回归：`uv run pytest -k "ssl or stream or dns or publish"` 全绿（含各域既有发布/回滚/版本断言）

## 2. 预览与漂移扩展（TDD）

- [ ] 2.1 RED：test_publish_preview.py 扩展——SSL 候选含证书链拼接（CA 签发证书）且拼接不进 platform_change；dns_proxy 键走通（快照按 stream_proxy 查询）；静态资源类型 400；stream/dns matrix 各一条；test_drift_detection.py 补 SSL 链噪声修复回归（单节点证书未变更不报漂移）
- [ ] 2.2 GREEN：预览服务消费 expand_baseline（platform_change 基线侧）+ 快照类型映射；漂移检测消费同一钩子（基线侧）
- [ ] 2.3 全量 pytest 收口（conftest 隔离库）

## 3. 前端三入口接线（TDD）

- [ ] 3.1 RED：PublishDiffButton.consumers.source.test.ts ENTRY_FILES 扩至 13 文件（+ServerCertList、StreamProxyList、DnsUdpProxyList；SslCertCard 断言按钮/emit），验证失败
- [ ] 3.2 GREEN：PublishPreviewModal resourceType/labels 扩至 8 键；SslCertCard server variant meta 行加按钮（emit preview-diff 上抛）；ServerCertList/StreamProxyList/DnsUdpProxyList 接按钮 + 弹窗 + 「去发布」回接既有发布流程；查看抽屉不接（D4）
- [ ] 3.3 前端验证：npx vue-tsc -b 0 error；相关组件/入口测试全绿；全量 vitest run --maxWorkers=4 收口

## 4. 真实页面验收（#51：多渲染路径必须真实页面核对）

- [ ] 4.1 SSL：服务器证书页用真实 ⚠ partial 行（证书「qcg」）点开预览——矩阵/私钥脱敏（******）/证书链拼接不产生噪声；「去发布」闭环截图
- [ ] 4.2 四层/DNS：StreamProxyList/DnsUdpProxyList 行预览各一（含查看抽屉无按钮核对）；截图留档

## 5. 收口

- [ ] 5.1 AGENTS.md #77 范围更新（七类全接入 + 双键/expand_baseline 教训）
- [ ] 5.2 openspec validate --all 0 error；tasks 逐项打勾；git commit
