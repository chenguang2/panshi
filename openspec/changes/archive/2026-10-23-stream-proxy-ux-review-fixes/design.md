# Design: stream-proxy-ux-review-fixes

## 决策

### D1 checks 保真（P0-1）——「勾选才提交」，后端零改动

向导提交体按 `advancedEnabled` 构造：未勾选时 `submitData` 不含 `checks`/`retries`/`retry_timeout` 键（后端 update 是 `exclude_unset`，不传即不改——cluster_stream_proxies.py:382）；勾选时照旧提交三者。创建路径：未勾选时三者完全不发（后端 create 的模型默认 checks=None）。

清除确认：编辑态取消勾选且原 proxy.checks 非空 → useOverlayModal 一次性确认「将清除该代理的健康检查配置，保存并发布后 Edge 侧健康检查将停止」；勾选回 null 的 watch（:849-859）保留但仅作为表单内部状态，不再直接决定提交。

Edge PUT 全量替换风险（领域事实 #101）：平台不发 checks → `proxy.checks` 保持原值 → 发布组装时 `if proxy.checks` 照旧下发原配置，无静默丢失路径。发布快照语义变为「用户显式配置的 checks」，与认知一致。

### D2 四态状态（P1-1）——完全复刻 upstream 模式

- 模型：`StreamProxy.last_publish_status = Column(String(20), nullable=True)`，**必须登记 `COLUMN_MIGRATIONS`**（约定 #118：漏登记启动 crash-loop）。
- 后端：列表与详情响应携带 `pending_publish`（`edge_sync.derive_pending_publish` 单点推导）与 `last_publish_status`（直接透传模型列）；publish/rollback 侧零改动——`edge_sync` 已按 hasattr 能力探测写 partial/清空（edge_sync.py:105/:220）。
- 前端：移除自制「已发布/未发布」二元徽章，卡片改用 `PublishStatusTag` 四态（`:pending` + `:last-publish-status`，对齐 UpstreamList.vue:74-75 传参）——同时消除「已发布徽章 + v1 标签」双语义重复。
- 状态 Tab（P2-5 部分）：列表工具行加 全部/未发布/待发布/已发布 快捷筛选 + 计数（对齐 GlobalRuleList 统计格先例）；客户端过滤 `displayedProxies`。

### D3 版本恢复语义（P1-2）——文案诚实化（默认），扩全量留决策点

推荐方案：共享 VersionManagementModal 的恢复确认文案对 stream 域补充恢复范围说明（恢复项：名称/协议/负载均衡/目标/超时/连接池；不随回滚：监听端口、健康检查、重试、DNS 配置）。实现上 modal 已有资源类型分支，加 stream 文案分支即可。

不推荐本轮扩 _restore 字段：checks 是 JSON 结构体，历史快照的 checks 结构可能与当前表单解析器不兼容，扩全量恢复引入新的静默变异面——与 P0-1 修的正是同类病。

### D4 删除风险感知（P1-3 + P2-9）

删除确认节点行复用发布确认的在线/离线标识样式（PublishConfirmModal.vue:40-68）；勾选 Edge 删除时默认全选**在线**节点、离线默认不选但可见；勾选子集时显示后果行「未选中的 N 个节点将保留该转发规则并继续承载流量」；部分失败终态列出失败节点清单 + 「重试删除」terminalAction（发布侧机制 useClusterUtils.ts:482-521 已有，删除侧接同一参数）。删除确认补 selection-bar 全选/取消全选（对齐发布确认）。

### D5 向导（P1-4/P2-10/P3-3/P3-4）

- 参考节点下拉：离线节点禁选 + 「（离线）」后缀；检测失败文案改「节点 {ip} 当前不可达或 Edge 未安装…可勾选下方『手动输入端口』继续，或到『节点管理』检查」并自动勾选手动输入 + focus。
- 高级配置 toggle：展开时 scrollIntoView + 短暂高亮（约定 #26 的 &#x3000; 类坑不涉及；纯 DOM API）。
- 编辑直达第 2 步：editingProxy 存在时 initial step=2，第 1 步压缩为顶部摘要条「集群 X · 端口 N · 参考节点 Y [修改]」。
- 移除代理类型 toggle 组：defaultProxyType 恒为 'normal' 的调用点（四层代理页）下整个 toggle 区不渲染（DNS 归 /dns-proxies 页）。

### D6 错误与文案（P2-1/P2-2/P2-7/P3-2/P3-8）

- 409 detail 带占用者：后端查重命中时取既有代理 name 拼入 detail「监听端口 {port} 已被四层代理「{name}」占用」；前端捕获 409 时回到第 1 步并给监听端口红框。
- 进度弹窗执行中隐藏取消/X（progressTaskInFlight 期间），终态文案不变；孤立时间戳：addLog 跳过空文本。
- 空态两态化：有关键词时「没有匹配「{kw}」的四层代理」+ 清除筛选按钮；图标换内联 SVG（对齐 #emptyText 既有 SVG 先例）。
- 发布确认标题带资源名、端口占用卡 used_by 加「被「{name}」占用」前缀、权重统一 `:100`（对齐抽屉）。

### D7 查看抽屉（P2-3/P2-4）——重排 + 补健康检查渲染，不改右侧抽屉形态

保持居中 Modal 形态（改真 Drawer 牵扯全站一致性，收益低）；分区重排为 摘要（状态/版本/端口/协议）→ 转发（目标/负载均衡）→ 高级（健康检查 JSON 摘要/重试/超时/连接池）→ 元数据；DNS 型渲染域名映射表（复用列表卡实现）；时间统一 formatDateTime 带年。

P2-4（四字段无编辑入口）本轮**不做表单编辑**：接受为已知缺口并记录；抽屉「高级」分区明示只读语义。

### D8 跨域小同步（P2-6/P3-5）

RouteList 发布确认补传 current-version（与 stream 同款一行）；StreamProxyList 搜索防抖换共享 `useDebouncedSearch`。

### D9 明确不做（已接受缺口，记录防重复上报）

版本恢复扩全量字段、抽屉四字段表单编辑、批量发布、进度弹窗终态表格化（showBatchStatusModal 形态借用的 ROI 评估后缓）、批量模式行内操作禁用（P3-6，与批量发布一起缓）、退出批量双入口去重（P3-9）。

## 测试策略

- 后端 TDD：`tests/test_stream_proxy_publish_status.py`（四态接线/partial）、`tests/test_stream_port_conflict_detail.py`（409 占用者名）、`tests/test_stream_proxy_rollback.py`（恢复范围钉住——部分恢复语义防未来误扩）。
- 前端 TDD：wizard checks 提交构造/清除确认/编辑直达、列表四态传参与状态 Tab、删除确认节点标识与重试、抽屉分区与 DNS 渲染、空态两态。共享组件（PublishConfirmModal/useClusterUtils terminalAction 删除侧）改动按约定 #217 先列消费方断言清单，`npx vitest run --no-file-parallelism` 收口（#208）。
- 真页走查（test 集群）复刻评审路径逐项验收。
