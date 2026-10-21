# Design: ssl-ux-review-fixes

评审报告：`docs/refactoring/ssl-ux-review-2026-10-20.md`（21 项发现与证据）。本文只记批 2 与跨域改动的设计决策；批 1 各项为直改，不设设计节。

## D1 待发布判定复用全站单点（P1-2）

`PublishStatusTag` 四态能力已存在（`pending`/`lastPublishStatus` props），SSL 页只传了 `version/published-at`。修法**不是**前端比较 `updated_at > published_at`（设计报告曾提议）——`derive_pending_publish` docstring 明确「两个上游列表端点 MUST 经本函数推导，禁止各自实现（单一事实源）」。SSL 对齐范式：

- `SslCertificateResponse` 加 `pending_publish: bool = False`（additive，旧消费方零影响）
- 三个端点（cluster_ssl 列表/详情 + 全局 ssl 列表）在已有 publish-map 回填处顺带调用 `edge_sync.derive_pending_publish(current_version=…, updated_at=…, published_at=…)`——三个入参响应里全部现成
- **partial 态本次不接**：上游域的 `lastPublishStatus='partial'` 数据源是发布结果 detail，SSL 发布走共享 `executePublish` 且无持久化结果，接线需先立项结果持久化（对照 static-resources 批 2 先例），超出本轮
- 判定顺序不变：未发布 → 待发布 → 已发布（SSL 无 partial 分支）
- 判定前提（2026-10-20 评审确认）：`SslCertificate.updated_at` 带 `onupdate=utcnow`（`models/ssl.py:41`）——真实编辑 bump、空保存不 bump（无列变更 SQLAlchemy 跳过 UPDATE）、恢复版本 bump。任务 2.1 用三条断言钉住该前提（onupdate 被改即红）。恢复版本场景顺带修复既有盲区：恢复后现行 UI 恒显「已发布」，实际 Edge 仍跑旧版内容，四态接线后正确显示「待发布」

## D2 生成弹窗 CA 一致性（P0-1/P2-6）

- P0-1：`:77-80` 的 `v-else-if="caCerts.length === 0 && !caCertsLoading"` 前置 `form.cluster_id &&`；未选集群分支渲染灰色 hint「请先选择集群，将列出该集群可用的 CA 根证书」。红色语义保留给「已选集群且确实没有」
- P2-6：`canGenerate`（`:430-437`）去掉 `form.algorithm !== 'sm2' ||` 豁免，全算法统一要求 `form.ca_cert_id`；按钮 disabled + title 指引；`validate()`（`:461-464`）的同条件 toast 随之成为死路径，删除。依据：后端 `cluster_ssl.py:513-529` 现状全算法强制，spec「RSA/ECC 忽略」是陈旧文本，随批 1 修正 `ssl-certificate-generation` delta
- CA 列表加载失败第三态（评审问题 8）：`loadCaCerts` catch 置 `caCertsError`，模板分支为 加载中 → 失败（灰字「CA 根证书列表加载失败」+ 重试按钮）→ 确认空列表（红字 + 创建指引，P0-1 专属语义）→ 正常列表。红色仅保留给「确认拿到空响应」——加载失败时红字「没有 CA」是 P0 同族误报（陈述未经证实的事实）

## D3 创建契约修正（P1-4b）

`SslCertificateCreate.cluster_id` 由 `Field(..., ge=1)` 改 `Optional[int] = None`：

- URL path 是归属唯一事实源（`cert_data["cluster_id"] = cluster_id` 本就覆盖 body 值）
- 端点层一致性校验（评审问题 4 修订：Pydantic validator 看不到 URL path param，校验不能放 schema）：`ssl_in.cluster_id is not None and ssl_in.cluster_id != cluster_id` → 422 detail「cluster_id 与 URL 中的集群不一致」（缺省或一致均接受，兼容既有调用方）；已核 `SslCertificateUpdate` 无 `cluster_id` 字段，PUT 无需同款处理
- 批 1 的前端 detail 数组拼接（`SslFormDrawer.vue:679`）独立生效——FastAPI 校验错误 detail 恒为数组，与后端改不改无关

## D4 私钥保护对齐（P1-6，批 2 核心，2026-10-20 评审修订）

目标：私钥（含国密签名私钥）不再随列表接口下发，获取路径全部留痕。四步：

1. **掩码泛化 + 盖签名私钥**：`mask_ca_private_key` 改无条件掩码且**同盖 `sign_key`**——响应含 `sign_key` 明文即旁路（国密双证的签名私钥与 `private_key` 敏感性等同，`schemas/ssl.py:31-32` 实证随响应下发）；`is_ca` 判定删除
2. **响应加布尔判定字段**：`has_private_key`/`has_sign_key: bool`（服务端真实有无）——下载弹窗与查看抽屉的私钥选项/👁 一律按布尔渲染，MUST NOT 读字段内容真值（掩码后恒空，真值判定会让私钥选项静默消失，评审问题 3）；组件测试 mock 必须用掩码后真实响应形状（#43）
3. **单一按需端点**：`GET /clusters/{id}/ssl/{cert_id}/key` 对**全部证书类型**生效（不区分 `is_ca`），国密证书返回加密+签名两个私钥；前端高风险确认弹窗 + `log_audit`「查看/下载私钥」。**现有 `/ca-key` 端点在调用方（CA 查看抽屉 + 相关测试）迁移后删除**——不做「CA 一套、server 一套」的双实现（#18，评审问题 6）
4. **留空=不修改（双防）**：编辑抽屉不回填明文、placeholder「已保存，留空表示不修改」；前端提交前把空私钥从 payload 省略；后端 setattr 循环对 `private_key` **单独**跳过 `None/""`。**仅此字段**，不得对全部字段一刀切跳空串——`client_ca` 等用户手动清空 textarea 依赖发空串生效，`gm=false` 的清空逻辑是端点显式赋值不受影响（评审问题 1，数据损坏级）
- 兼容确认：前端仅 SSL 三组件消费列表响应私钥（已核）；`cluster_backup` 导出/edge_import 走服务端序列化不经列表接口，不受影响；PUT 端 `exclude_unset=True` 只省略「前端没发的字段」，防不了「发了空串」，故必须双防
- **破坏性响应变更，前后端同仓同版本部署，无窗口期**；合入门槛含逐字节回归：编辑不碰私钥保存后，库中私钥与改前一致
- 风险：真实用户工作流「复制私钥去节点排障」改走确认弹窗——交互多一步，属有意为之的安全收益

## D5 PEM 预览端点（P1-5b）

`POST /clusters/{id}/ssl/preview`，body `{cert?: str, key?: str}`：

- 复用 `schemas/ssl.py::derive_expiry` 同款 cryptography 解析（抽公共函数），响应分字段（评审问题 9）：`cert: {ok, subject_cn, san[], not_after, algorithm, expire_days} | null`（null=未提供，ok=false=提供了但解析失败）、`key: {ok} | null`、`key_match: bool | null`——仅 cert 与 key 均 ok 时返回（公钥等价性比对）
- 不落库、只读；前端预览行按字段各自渲染状态（解析失败/不配对分开展示，不再用单一 parse_ok 含糊表述）
- 前端：文件选择或 textarea 失焦（防抖）调用，预览行展示在对应输入框下方

## D6 共享删除弹窗的 Edge 后果行

`useClusterUtils.ts` 删除确认弹窗（AppModal 体系）勾选「Edge 节点」后当前无后果行（未勾选时已有「Edge 将继续运行」行，`:150-151`）。加可选 prop `edgeConsequenceHint`（默认无、其它域零变化），SSL 传「将从所选节点移除该证书，使用它的 HTTPS 域名将无法建立 TLS 连接」。跨域共享改动按 #51④ 回归各域删除用例。

## D7 生成弹窗重排（批 2，纯前端）

现有顺序 算法→集群→CA→mTLS→名称/CN→组织→SAN→有效期（截图 05）重排为：

```
① 签发：算法 / 集群（预选当前筛选）/ 签发 CA
② 主体：名称 / CN / 组织 O·OU（默认值占位已正确）
③ 覆盖范围：域名 SAN / IP SAN / 有效期（旁注即时推算到期日）
▸ 高级选项（默认折叠）：mTLS / 同时生成客户端证书
```

mTLS 折叠不改变其显示条件（SM2 + server），spec 措辞定为「区域可见、默认折叠、展开可达」——与现行「可折叠区域」条文一致，仅补充默认态（评审问题 10）。回归 `SslGenerateDialog` 全部组件用例 + 实页走查。

## 批次划分理由

- 批 1 全部为**加法或文案**：不改变任何接口契约（pending_publish 是 additive 字段），失败模式是显示错误，可独立回滚
- 批 2 的组 9（掩码）是**破坏性响应变更**、组 8 触及创建契约——必须设计先行 + PG 冒烟 + 私钥全链路实页走查后再动
- 顺序依赖：组 9（掩码）落地前，组 10 的预览端点无安全意义（列表仍泄漏私钥）；组 8 的「留空不修改」是组 9 掩码后编辑链路的前置
