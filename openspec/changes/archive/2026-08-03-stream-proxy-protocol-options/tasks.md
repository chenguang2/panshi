## 1. 后端 scheme 校验（仅约束写入）

- [x] 1.1 `backend/app/schemas/stream_proxy.py`: 在 `StreamProxyCreate` 与 `StreamProxyUpdate` 的 `scheme` 字段加 `Literal["tcp", "udp", "tls"]`（Create 默认 `"tcp"`，Update 保持 Optional）；**`StreamProxyBase` 保持 `str` 不变**（避免 `StreamProxyResponse` 继承校验导致读取 500）
- [x] 1.2 `backend/app/schemas/stream_proxy.py`: 确认 `sni` 等其余字段不受影响

## 2. 后端导入 scheme 归一化

- [x] 2.1 `backend/app/services/edge_import_service.py`: `convert_stream_proxy`（约 L451）对 `upstream.get("scheme", "tcp")` 结果归一化：`v if v in ("tcp","udp","tls") else "tcp"`（含 `tcp_udp`→`tcp`），保证导入产物永远合法
- [x] 2.2 `backend/app/services/edge_import_service.py`: 确认 DNS 分支硬编码 `"udp"`（约 L425）与 config_version 写入（约 L1197）不受影响

## 3. 存量数据迁移

- [x] 3.1 `backend/app/core/migrate.py`: 新增迁移项，将 `ps_stream_proxy.scheme` 非三值归一化为 `'tcp'`（`UPDATE ... WHERE scheme NOT IN ('tcp','udp','tls')`），清理历史 `tcp_udp` 残留

## 4. 前端命名变更（菜单/列表/标签）

- [x] 4.1 `frontend/src/components/AppSidebar.vue`: 侧边栏菜单 "TCP代理" → "四层代理"（label 字段，feature 键 `stream_proxy` 不变）
- [x] 4.2 `frontend/src/composables/useStreamProxyList.ts`: `pageTitle`/`itemLabel` 的 normal 分支 "TCP 代理" → "四层代理"；`pageDesc` 更新为"管理集群级的 TCP/UDP/TLS 四层转发规则"
- [x] 4.3 `frontend/src/views/StreamProxyList.vue`: PageHeader `title="四层代理"`、`description="管理 TCP/UDP/TLS 四层转发规则"`、按钮 "+ 新建四层代理"；`schemeLabel` 补 `tls → TLS`
- [x] 4.4 `frontend/src/views/DefaultLayout.vue`: `StreamProxyList: 'TCP 代理'` → `'四层代理'`
- [x] 4.5 `frontend/src/components/VersionManagementModal.vue`: `resourceType === 'stream_proxy' ? 'TCP 代理'` → `'四层代理'`
- [x] 4.6 `frontend/src/components/StreamProxyFormWizard.vue`: 代理类型切换按钮 "TCP代理" → "四层代理"（约 L94，spwf-toggle 内）
- [x] 4.7 `frontend/src/components/StreamProxyViewDrawer.vue`: `schemeLabel` 补 `tls → TLS`（约 L132）
- [x] 4.8 `frontend/src/types/index.ts`: `StreamProxy.scheme` 类型改为 `'tcp' | 'udp' | 'tls'`
- [x] 4.9 `frontend/src/views/DnsUdpProxyList.vue`: 确认继承文案（DNS 代理不受改名影响），无需改动或仅验证

## 5. 前端协议 Radio 三选一（向导）

- [x] 5.1 `frontend/src/components/StreamProxyFormWizard.vue`: Step2 协议字段（约 L132 spwf-protocol-badge）从只读徽标改为 Radio 三选一（TCP 默认选中 / UDP / TLS），选项为卡片式两行（协议名 + 一句话说明）
- [x] 5.2 `frontend/src/components/StreamProxyFormWizard.vue`: 协议 Radio 的 v-model 绑定 `form.scheme`，选择 TCP→`'tcp'`、UDP→`'udp'`、TLS→`'tls'`
- [x] 5.3 `frontend/src/components/StreamProxyFormWizard.vue`: 协议字段下方增加动态提示行，随选中值变化（TCP→"按 TCP 协议转发到上游节点"；UDP→"按 UDP 数据报转发，无连接语义"；TLS→"以 TLS 加密方式转发 TCP 流量"）
- [x] 5.4 `frontend/src/components/StreamProxyFormWizard.vue`: 编辑模式默认值 `form.scheme = p.scheme || 'tcp_udp'`（约 L805）改为 `form.scheme = p.scheme || 'tcp'`——`tcp_udp` 是历史遗留（git 3836f54 已移除该选项，此默认值是遗漏），非合法协议类型；并对 `p.scheme` 非三值（如旧数据 `tcp_udp`）回退 `'tcp'`。`proxy_type` watch 中 normal 分支保持 `scheme='tcp'` 不变，DNS 分支保持 `scheme='udp'` 不变
- [x] 5.5 `frontend/src/components/StreamProxyFormWizard.vue`: DNS 模式（`proxy_type='dns'`）协议显示保持固定 UDP 徽标，不受 Radio 影响

## 6. Edge 文档同步

- [x] 6.1 `docs/edge/user-guide/使用手册.md` L993: Stream 路由 `protocol` 可选值加 `"TLS"`（`"TCP"`, `"UDP"`, `"TLS"`）
- [x] 6.2 `docs/edge/user-guide/使用手册.md` L1258: Stream 上游 `scheme` 可选值加 `tls`（`tcp`, `udp`, `tls`）

## 7. 测试

- [x] 7.1 `backend/tests/`: 新增测试——通过 API 提交非法 scheme（如 `grpc`、`tcp_udp`）SHALL 被 422 拒绝
- [x] 7.2 `backend/tests/`: 新增测试——DB 中存在 `scheme='tcp_udp'` 的代理时，list/get/publish 接口 SHALL 仍返回 200（不 500）
- [x] 7.3 `backend/tests/`: 新增测试——导入 scheme 为 `http`/`tcp_udp` 的 stream proxy 后，产物 scheme 被归一化为 `tcp` 且可正常读取
- [x] 7.4 `frontend/src/composables/__tests__/useStreamProxyList.test.ts`: L23 断言 `pageTitle.value` 同步更新为 `'四层代理'`
- [x] 7.5 运行 `cd backend && uv run pytest` 通过
- [x] 7.6 运行 `cd frontend && npm run build`（vue-tsc）通过，无类型错误
- [x] 7.7 运行 `cd frontend && npx vitest run` 通过
- [x] 7.8 运行 `cd frontend && npx playwright test` 通过
- [x] 7.9 手动验证：新建向导中 TCP/UDP/TLS 三选一、说明与动态提示显示、列表卡片协议徽标（TCP/UDP/TLS）、侧边栏菜单"四层代理"、DNS 代理不受影响

## 8. 修复：TLS 发布失败（Edge protocol 枚举）

- [x] 8.1 根因：Edge stream route 顶层 `protocol` 枚举只接受 `"TCP"`/`"UDP"`（实测 TLS/SSL/TCP_SSL/tls 全部 400 拒绝）；TLS 通过 `upstream.scheme="tls"` 表达（实测接受）
- [x] 8.2 `backend/app/api/v1/cluster_stream_proxies.py`: 新增 `_edge_protocol(scheme)`——`udp→"UDP"`、`tls/其他→"TCP"`、`None→None`，替换原 `scheme.upper()` 顶层 protocol 计算
- [x] 8.3 `backend/app/api/v1/cluster_dns_proxies.py`: 复用 `_edge_protocol`（DNS scheme 恒 udp，行为不变）
- [x] 8.4 `docs/edge/user-guide/使用手册.md` L993: 修正 `protocol` 枚举（去掉 "TLS"，注明 TLS 由 upstream `scheme: "tls"` 配置，顶层 protocol 仍为 "TCP"）
- [x] 8.5 `backend/tests/test_stream_proxy.py`: 新增 `TestStreamProxyPublishProtocol`（tls→TCP、udp→UDP、未知→TCP、None→None）
- [x] 8.6 真实 Edge QA：代理 59/58 (tls) 发布成功（Edge 存储 scheme="tls" + protocol="TCP"，version v3）
- [x] 8.7 清理：探测路由全部删除，Edge 无残留；后端测试无新失败；前端 build 通过
