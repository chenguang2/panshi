# Tasks: ssl-cert-rollback-consistency

## 1. 回滚恢复（TDD 先行）

- [x] 1.1 RED→GREEN：`tests/test_ssl_rollback_consistency.py` 先补键名双读用例（`snis` 数组版快照回滚恢复全量、`sni` 字符串版恢复、两键皆无不清空），再改 `cluster_ssl.py::_restore` 的 SNI 读取逻辑（`snis`/`sni` 双读 + `merge_reserved_into_sni_str`）
- [x] 1.2 RED→GREEN：先补「回滚后从恢复的 PEM SAN 重同步 sni」用例（快照 snis 缺 IP 而 PEM SAN 有 → 回滚后 sni 含 IP；不可解析 PEM 降级不抛错），再在 `_restore` 恢复 `cert` 之后接 `parse_cert_pem` 重同步；`uv run pytest -k "ssl"` 回归（含 `test_ssl_expiry.py`/`test_ssl_preview.py`）

## 2. 发布口同步（TDD 先行）

- [x] 2.1 RED→GREEN：先补发布推导用例（PEM SAN 全量进 `sni_list`（含 IP）；解析失败回退 `cert.sni` 拆分），再改 `publish_ssl_certificate` 的 `sni_list` 推导；发布成功后回写 `cert.sni`（复用既有 publish 事务，注意约定 #29：不新增第二会话写库）
- [x] 2.2 后端 `sni_mismatch` 派生字段：`SslCertificateResponse` 增加派生布尔（`derive_expiry` 同款校验器内计算：规范化集合比对，PEM 解析失败恒 false）；schema 测试断言真/假/不可判定三态

## 3. 前端（TDD 先行）

- [x] 3.1 RED→GREEN：`SslCertCard.test.ts` 先补警示行用例（`sni_mismatch=true` 显示「匹配名单与证书 SAN 不一致」+「同步」按钮并 emit；false/缺失不渲染），再改 `SslCertCard.vue`（server 形态警示行）
- [x] 3.2 RED→GREEN：`ServerCertList.test.ts` 先补接线用例（sync 事件 → `PUT /clusters/{cid}/ssl/{id}` 携带 SAN 推导 sni → 刷新），再实现页面 handler；消费方核对（grep `SslCertCard` 使用点，约定 #217）
- [x] 3.3 全量回归：`npx vitest run --no-file-parallelism` 全绿（连续 3 轮各 1 例无关文件轮转漂移——NodeTaskCenter/EdgeClientRouteLabel，隔离复跑均绿，判漂移非回归）+ `npx vue-tsc -b` 零错误 + `npm run build` ✓

## 4. 验证与收口

- [x] 4.1 真页走查：uapm 卡片出现不一致警示 → 点击「同步」→ 警示消失且 sni 含 IP；对 uapm 执行发布 → Edge 匹配名单含 IP（真集群验证，走查数据用后清理）
- [x] 4.2 回滚链路真数据回归：对测试证书发布 v2 → 回滚到 v1 → 确认 sni 与恢复后 PEM SAN 一致（不再出现 uapm 式脱节）
- [x] 4.3 `uv run pytest -k "ssl"` 全绿；后端零 schema 变更确认（无 COLUMN_MIGRATIONS 登记）
- [x] 4.4 `openspec validate --all` 0 error 收口
