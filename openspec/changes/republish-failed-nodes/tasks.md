# Tasks

## 1. 共享实现（先行）

- [x] 1.1 新建 `composables/useRepublishFailedNodes.ts`：输入 `{ resourceType, resourceId, clusterId, label }`；提供 `republish(row)`——拉 `GET /clusters/{cid}/publish-preview/{type}/{rid}` → 提取失败集合（node_status ∈ diff/unreachable/missing，含 behind_nodes）→ 经 `fetchAllClusterNodes` 按 IP（兜底 `node-{id}` 跳过映射）映射 node id → 返回 `{ failedNodeIds, noticeText }`；解析成功/回退/异常三路径返回可判别结果
- [x] 1.2 文案函数与静态资源页 `failedNoticeText` 同构（1 个不带「等」，多节点首个 + 「等」；原因取预览逐节点 reason/error 首项）
- [x] 1.3 组件级单测：解析成功（含 IP 映射与 `node-{id}` 兜底跳过）/ 基线缺失回退 / 请求失败回退 / 集合为空回退 / pending 不发预览请求；防重复点击（in-flight 守卫）

## 2. 六页接线（同一形态，逐页最小改动）

- [x] 2.1 四层代理 `StreamProxyList.vue`：`partialNoticeText` 接共享 notice 文案；`lp-notice` 加「重发失败节点」主动作（`useRepublishFailedNodes`）+ 保留「查看差异」次动作；静态资源页同构双按钮样式
- [x] 2.2 `DnsUdpProxyList.vue` 同 2.1
- [x] 2.3 `DnsQueryList.vue`（DNS-HTTP）：补齐同款 `lp-notice`（partial 态判定 + 文案 + 双动作）
- [x] 2.4 `PluginConfigList.vue` 同 2.1
- [x] 2.5 `GlobalRuleList.vue` 同 2.1
- [x] 2.6 `PluginMetadataList.vue`：补齐同款 `lp-notice`
- [x] 2.7 发布确认弹窗接线：各页打开 `PublishConfirmModal` 时传 `preselected-node-ids`（失败集合；该 prop 已有「仅预选在线节点」语义，零改动）

## 3. 守卫与回归

- [x] 3.1 源码守卫：`mockupParity.source.test.ts` 增段——六页均含 `useRepublishFailedNodes` 接线与双动作提示条、禁止页面内联解析预览响应
- [x] 3.2 断言反转清单（#217）：四页既有用例中「泛化文案」断言（`发布未完全生效，请查看发布差异`）改为「默认泛化、重发后具体」双态断言；DNS-HTTP/插件元数据新增提示条用例
- [x] 3.3 全量回归：`npx vitest run --maxWorkers=4` + `npx vue-tsc -b`；按约定 #58 处理漂移型波动

## 4. 验收与收口

> 落地记录（2026-11-19）：composable 10 例全绿；六页接线 + 守卫（mockupParity 三段）+ 全量 3077 passed（3 例按约定 #58 隔离复跑全绿定性波动）；vue-tsc -b 干净。真机（1600）：四层代理 partial 卡「9876」点重发 → 预览取失败集合（192.168.0.15 unreachable，原因 403 白名单）→ 弹窗仅预选该节点（其余在线未选、离线不可选）+ notice 文案升级为具体节点。4.2 说明：当前库无「旧快照基线缺失」数据（近期发布均留 edge_payload），回退三路径由 composable 单测钉住（baseline_missing / request_failed / empty），未在真机强造数据。**附带修复**：DNS-HTTP 页「查看差异」死按钮（openPublishPreview 只置 ref、模板无 PublishPreviewModal）——已补弹窗接线（resource-type=route）。

- [x] 4.1 真机验收（用户实际操作页面，#51 规则）：造一条部分失败数据（或利用现有 demo 库 `/hello` 2/3 节点失败样例），六页逐页截图确认：文案具体节点 + 点重发 → 弹窗预选失败节点
- [x] 4.2 回退路径真机抽查：对旧快照（基线缺失）资源点重发 → 回退泛化文案无报错
- [x] 4.3 tasks.md 勾选收口 + `openspec validate --all` 0 error

## 5. chips「部分失败」档（批 5，用户批准 2026-11-19）

- [x] 5.1 共享 `useStreamProxyList.statusOf/statusCounts` 加 partial 档（待发布优先于 partial）；`StreamProxyList` / `DnsUdpProxyList` statusTabs 加「部分失败」chip；`DnsUdpProxyList` 页内 rowsFiltered 同口径修正
- [x] 5.2 四独立页（插件组/全局规则/DNS-HTTP/插件元数据）statusOf + chips + rowsFiltered 加 partial 档
- [x] 5.3 用例：DnsUdpProxyList partial chip 计数与筛选；既有 chips 断言复核（无「已发布」误计回归）
- [x] 5.4 `npx vue-tsc -b` + 六页测试全绿

## 6. 方案 B：失败明细持久化（D10–D12，用户批准 2026-11-19）

- [x] 6.1 五模型加 `last_publish_detail` TEXT 列（Route/PluginConfig/PluginMetadata/GlobalRule/StreamProxy）+ `COLUMN_MIGRATIONS` 注册（约定 #118）
- [x] 6.2 `edge_sync.publish_resource` 单点写回：partial → `{total, success, failed, failed_nodes:[{node, error}], route}`；全部成功清 NULL；`rollback_resource` 清明细（与 last_publish_status 同点）
- [x] 6.3 `cluster_backup._entity_kwargs` 统一丢弃 `_RUNTIME_STATE_KEYS`（D12：导入不继承发布痕迹，顺带修复既有其他分支的 last_publish_status 泄漏）
- [x] 6.4 六页数据源全局列表端点透出解析后的明细：/stream-proxies、/routes、/plugin_configs、/global_rules、/plugin_metadata（str→dict schema 边界，#48 同款）
- [x] 6.5 后端测试：partial 落明细 / 成功与回滚清空 / 列表透出解析对象 / 导入丢弃；`test_publish_response.py` 源码守卫复核（#18）
- [x] 6.6 PG 方言冒烟（#103：schema/写库路径变更必跑）
- [x] 6.7 前端：`useRepublishFailedNodes` 导出 `noticeTextFromPublishDetail`；六页 `partialNoticeText` 三级回退（持久化 → 会话缓存 → 泛化）；用例「打开页面即显示具体失败节点」
- [x] 6.8 全量回归 + `openspec validate --all` 收口

> 批 5+6 落地记录（2026-11-19）：chips 四档全六页真机确认（四层 16=7+2+6+1，partial 从「已发布」拆出）；方案 B 后端——五列 + COLUMN_MIGRATIONS、publish_resource/rollback hasattr 单点写回/清除、_RUNTIME_STATE_KEYS 补 last_publish_status（修复既有导入泄漏）、五全局列表端点透出解析明细（PublishDetailField Annotated str→dict）；PG 冒烟 11 passed（#103）；前端三级回退（持久化 → 预览缓存 → 泛化）+ partialNoticeText 六页接线。真机：四层代理 9876 打开即见「1 个节点分发失败（192.168.0.15:16620 Edge API error 403…）」（该明细来自真实 partial 发布经新写回路径落库），无 console 错误。全量 3080 passed（SearchInput 1 例隔离复跑全绿，#58 波动）。
