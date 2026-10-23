# Design: ssl-version-orphan-purge

## 决策

### D1 删除清理挂在 DELETE 端点的 `delete_db` 分支

与其它六域完全同款：`ConfigVersion.__table__.delete().where(resource_type=="ssl", resource_id==cert_id)`，在 `db.delete(cert)` 同一事务内执行后一起 commit。不做 FK/ORM cascade（SQLite FK 默认关闭、跨库方言差异、且既有域均为显式 purge——保持单一模式）。

### D2 存量清理用「早于所属证书创建时间」判定，启动时执行

判定：`cv.created_at < sc.created_at`（join `ps_ssl_certificate`）→ DELETE。依据：id 复用产生的孤儿必然早于当前证书出生；同代快照（含回滚事故产生的异名快照 v3/v5）不受影响——它们是这条证书记录的真实发布历史，交由 D3 可见化 + 手动删除处置，避免按 name 猜测的启发式清理。

执行点：main.py lifespan `init_db` 之后单次调用，幂等（重复执行零行删除）、双方言（SQLAlchemy core join-delete，SQLite/PG 通用）。单实现收敛在 `services/ssl_version_cleanup.py::purge_orphan_ssl_versions`。

### D3 快照 name 可见化纯前端实现

版本响应的 `config` 字段已含快照 JSON 原文，前端 `JSON.parse(config).name` 即得快照名——零后端改动、其它域自动受益（凡快照带 `name` 的域都有可见性）。解析失败（老格式 certs/keys 组合等）不显示、不告警。

展示两处：
1. 列表项：快照 name ≠ 当前资源名时，版本号旁追加标记（如「异代」小徽章 + tooltip 显示快照名）；
2. 回滚确认弹窗：不一致时追加红色警示行「该版本属于『xxx』（疑似历史遗留的异代快照），恢复将覆盖当前证书的名称与内容」。

共享组件改动按约定 #217：先核消费方全集，断言反转清单先行，串行全量收口。

### D4 不做 FK 约束与全表迁移

resource_id 无 FK 是全库现状（6 个域共用 ConfigVersion），加 FK 需迁移 + 各域回填清理，成本/风险远超收益；ssl 域补 purge + 启动清理已闭环本缺陷。

## 测试策略

- 后端 TDD：`tests/test_ssl_version_orphan_purge.py`（删除清版本、启动清理幂等、同代快照保留、异代快照保留）。
- 前端 TDD：`VersionManagementModal.test.ts` 增补（异代徽章、回滚警示、一致时不渲染）。
- 收口：`pytest -k "ssl"` + 前端串行全量 + validate。
