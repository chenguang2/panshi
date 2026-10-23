# Design: ssl-cert-rollback-consistency

## 上下文

SSL 证书的匹配名单（`SslCertificate.sni`，逗号分隔字符串）与证书本体（`cert` PEM 的 SAN 扩展）是两个独立存储。生成时同步一次；版本快照复用发布 `config_data`，其中 SNI 键按数量二选一（`sni`/`snis`），老格式（2026-07 前）为 `sni` 字符串 + `certs`/`keys` 数组。回滚 `_restore` 逐字段恢复且只认 `sni` 键。

## 决策

### D1 事实源选定：证书 PEM 为准

`sn ≡ SAN` 是业务不变式（编辑界面 SNI 只读、生成时同步，均以此为前提）。修复选择**证书 PEM SAN 为唯一事实源**：回滚恢复后、发布组装时，都从 PEM 解析 SAN 重推导 sni，而不是信任快照里的 sni/snis 键。

理由：PEM 与节点上部署的文件一一对应（用户直查节点证书内容即 SAN）；sni 快照键跨三代格式漂移不可信；SAN 解析已有单实现 `services/ssl_pem.parse_cert_pem`（含优雅降级）。

### D2 键名双读，不做快照迁移

`_restore` 读 SNI 时 `snis`（list）与 `sni`（str）双格式兼容。**不迁移历史快照**：ConfigVersion 是不可变的审计记录，改写历史违背其语义；读取侧兼容即可。v1 类超老格式的 `certs`/`keys` 数组键维持现状不恢复（仅 `cert`/`key`），与本变更无关。

### D3 回滚后重同步 = 不变式收口点一

`_restore` 恢复 `cert`/`key` 后，立即用 `parse_cert_pem(恢复后的 cert)` 解析 SAN，将 `dns_sans + ip_sans` 合并写回 `cert.sni`（保留 `merge_reserved_into_sni_str` 系统保留项）。解析失败（国密双证书等非标 PEM）回退为「保留双读恢复出的 sni」，不抛错——与 `derive_expiry` 同款优雅降级。

### D4 发布口同步 = 不变式收口点二（存量自愈）

`publish_ssl_certificate` 组装 `config_data` 时，`sni_list` 改为：优先 `parse_cert_pem(cert.cert)` 的 SAN（dns+ip）；解析失败回退现 `cert.sni` 拆分。效果：uapm 类存量脱节数据**无需手动修复**，下次发布即自愈；Edge 永远收到与证书文件一致的匹配名单。发布后是否回写 `cert.sni`？——是（同步回写，保持库内一致，避免发布后卡片警示仍在）。

### D5 不一致警示 + 一键同步（可见性）

后端列表/详情响应新增派生布尔 `sni_mismatch`（`cert.sni` 规范化集合 ≠ SAN 集合时为 true；PEM 解析失败为 false——无法判定不告警）。服务器证书卡片在 `sni_mismatch` 时显示警示行「匹配名单与证书 SAN 不一致」+「同步」按钮；点击调既有 `PUT /clusters/{id}/ssl/{id}`（`sni` 传 SAN 推导值）后刷新。不放发布链路里强拦（发布已自愈，警示只为解释「为什么发布后 sni 变了」）。

### D6 回滚确认弹窗不改

`VersionManagementModal` 的「确认恢复配置」已如实告知「恢复不推送 Edge」；恢复范围扩大（含 sni 重同步）不改变用户可感知语义（恢复该版本内容），不为 SSL 单加分支文案——避免共享组件条件分叉（约定 #217 反例成本 > 收益）。

## 测试策略

- 后端 TDD：`tests/test_ssl_rollback_consistency.py` 新增（回滚双读、回滚后 SAN 重同步、解析失败降级、发布口 SAN 推导、sni_mismatch 派生）；复用 `test_ssl_expiry.py` 的自签证书构造器模式。
- 前端 TDD：`SslCertCard.test.ts` 警示行/按钮用例；`ServerCertList.test.ts` 同步动作接线用例。
- 回归范围：`pytest -k "ssl"` + 前端 ssl 相关全文件（约定 #51-④）。
