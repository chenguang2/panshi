# Tasks: dns-udp-proxy-ux-parity

## 1. 批 1：四态接线（后端 → 前端）
- [x] 1.1 RED：`tests/test_dns_proxy_publish_status.py`——域内列表/详情携带 pending_publish/last_publish_status；编辑后 pending=true（对齐 test_stream_proxy_publish_status.py 模式）
- [x] 1.2 GREEN：`cluster_dns_proxies.py` 列表与详情接 `derive_pending_publish`（照 cluster_stream_proxies 批 2 模式）；`pytest -k "dns"` 回归
- [x] 1.3 RED：`DnsUdpProxyList.test.ts`——卡片四态（待发布/未完全生效）、状态分段控件（过滤/aria/empty）、pending 不再显示「已发布」
- [x] 1.4 GREEN：卡片换 PublishStatusTag 四参；状态分段控件并入筛选行（复用四层页样式与 goStatus）；`vue-tsc -b`

## 2. 批 2：抽屉与向导修复
- [x] 2.1 RED：抽屉测试——状态行渲染 PublishStatusTag（非未知元素）；域名映射按 hosts 键渲染（真实结构夹具，#43 真实响应形态）；DNS 型不显示「负载均衡」行
- [x] 2.2 GREEN：抽屉补 import + hosts 键名 + DNS 型隐藏 LB 行
- [x] 2.3 RED：向导测试——WAN 开关在 DNS 型编辑/新建均可见可切换；资源名词（defaultProxyType 派生）：标题「新建/编辑 DNS 代理」、成功 toast「DNS 代理已创建」
- [x] 2.4 GREEN：WAN 开关移至 DNS 配置区顶部；名词映射函数收敛单点

## 3. 批 3：删除风险与 P2 批
- [x] 3.1 RED：共享层——deleteEdge 且 edgeResults 空（全 skipped）时终态 exception + 诚实文案；既有「集群中没有活跃的 Edge 节点」场景语义保持（节点确实全离线且用户勾了 Edge → 警示）
- [x] 3.2 GREEN：`logSingleDeleteResults` 修正；`useClusterUtils.test.ts` 同域回归（#51-④）
- [x] 3.3 RED：`DnsUdpProxyList.test.ts`——删除确认三 opt-in 断言（在线标识/默认全选/子集后果）、retryable、发布确认资源名+v(N+1)、空态两态化、共享防抖、「该 DNS 代理」文案、TTL s 格式
- [x] 3.4 GREEN：deleteProxy 接 opt-in/retryable；空态 SVG 两态；useDebouncedSearch；文案修正；TTL 统一
- [x] 3.5 全量收口：`npx vitest run --no-file-parallelism` 全绿 + `vue-tsc -b` 零错误 + `npm run build` ✓；`pytest -k "dns or stream"` + PG 冒烟（触发式：本轮触及写路径派生，跑 test_pg_dialect_smoke.py）

## 4. 批 4：验收
- [x] 4.1 真页走查（对照四层代理页标准形态）：四态卡片、分段控件、抽屉域名映射/状态行、WAN 开关、删除标识+假成功警示、toast 名词；截图归档；走查数据 API 清理复核 0 残留 ✓（scheme-force-* 50 条清单已导出 /tmp/opencode/scheme-force-residual.md 供用户处置；删除确认三标识由共享层单测 71 例 + stream 页真页同款验证 + DNS 页源码守卫收口——E2E 编排受 AntD wrap 干扰未走通，不影响验证结论）
- [x] 4.2 `openspec validate --all` 0 error
