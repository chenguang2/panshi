# Proposal: security-hardening-p0p2

## Why

五维全栈代码审查（4 泳道并行 + 编排者抽验合成，报告 `docs/refactoring/code-review-2026-10-04.md`，commit `372a8c7f`，tag `code-review-2026-10-04`）产出严重 5 / 中等 28 / 建议 34。P0 四项、P1 六项、P2 六项已按批次 TDD 修复落地（`ab34af7e` / `87afe556` / `da9a4011`），验证面为新增 `test_code_review_p0/p1/p2.py` 共 46 例 + 后端全量 2289→2328 passed。

## What Changes

### P0（ab34af7e）

- **S1 部署密钥链 fail-fast**：service unit 占位密钥 `your-production-secret-key` 进 `_PLACEHOLDER_SECRETS` 黑名单；unit 模板改 `EnvironmentFile`；`APP_ENV=production` 无有效密钥配置即启动失败（占位密钥兼 JWT 签名与 Fernet 加密双角色，静默生效可伪造 admin token）
- **S2 edge_import 事件循环解冻**：三处 async 内裸调同步 httpx 改 `asyncio.to_thread`；三端点长 IO 前 `db.commit()` 落审计并释放写锁（全仓最后一块假 401 事故土壤）
- **S3 连接测试真异步**：`_do_test` 同步体卸载工作线程，`asyncio.wait_for(3s)` 从「永不生效」变为真可取消（此前 PG 不可达可阻塞事件循环分钟级）
- **S4 分发假成功守卫**：批量分发腿补 `_ansible_false_success_error` 调用（节点不在清单 rc=0 即全体标 success 的假成功）

### P1（87afe556）

- **M5 Fernet 密钥单源**：`_fernet` 复用 security 解析的 JWT_SECRET_KEY；启动时自动迁移旧密钥加密的存量密文
- **M1 三处 SSE 端点前置 commit**（cluster_edge_env deploy / edge_autostart / cluster_install）：交出流前落审计骨架、释放 SQLite 写锁（生成器体内 commit 不算数）
- **M9 raw_delete 补 X-Edge-Target** 中继头 + 403 转译（中继静态资源删除必失败且报错形态误导）
- **M21 SSHPASS 子进程级注入**：`env_extra` 传递到 spawn 点，进程环境不再残留明文密码
- **M22 ansible artifacts 保留策略** keep=100（1182 runs/83MB 无清理）
- **M26 async 引擎 FK pragma**：async 引擎挂 connect 监听补 `PRAGMA foreign_keys=ON`
- **M27 勘误**：SQLite 迁移 PRAGMA「事务内 no-op」经实弹探针证伪（pysqlite defer-to-DML），不改码，行为测试留作不变量守卫

### P2（da9a4011）

- **⑤ 工件保留统一**：`_export_tasks` 进程内 dict 容量收敛 KEEP=100；`ps_config_version` 复合索引 `(cluster_id, resource_type, resource_id)`（模型声明 + `_ensure_index` 存量库补建双轨）
- **① 守卫下沉共享出口**：假成功守卫搬进 `run_playbook` 唯一出口（调用方自动免疫）；EdgeClient 中继头/403 转译收敛 `_relay_aware_headers`/`_check_relay_whitelist_403` 唯一出处
- **⑥ 凭据崩溃自愈**：relay_sshd 注入行打标 `# panshi-injected`；启动 `sweep_injected_creds` 清扫崩溃残留 + 0600 收权
- **③ CWD 路径锚定**：features.yaml / .restart.flag / edge 日志 / 迁移备份目录四处 `__file__` 锚定 + 源码守卫（`db_config` 存储态相对路径为有意设计，打 `cwd-relative-by-design` 显式豁免）
- **② 密钥随包**：gen-linux.sh 打包同步 `.jwt_secret`（与 db_config.json 配对，否则目标机密钥重生成、已拷贝的加密密码全部不可解）
- **④ 事件循环纯度守卫**：黑名单制源码扫描（fetch_edge_data / _verify_reachable / _do_test_sync），附带修掉 db_switch `_verify_reachable` 两处裸调

## Capabilities

### Modified

- `database-management`：「连接配置管理」补连接测试真异步与 Fernet 密钥单源场景
- `edge-data-import`：「连接测试」补事件循环卸载场景
- `relay-sshd-setup`：「root 凭据仅本次使用」补崩溃自愈场景

### Added

- `security-hardening-guardrails`（新能力）：部署密钥链 / 事务纪律与事件循环纯度 / 守卫下沉 / CWD 锚定 / 密钥随包 / 工件保留与索引 / async FK pragma / SSHPASS 子进程级

## Impact

- 后端：security.py、db_config.py、database.py、edge_import*.py、node_task_service.py、ansible_service.py、edge_client.py、relay_sshd.py、relay_push.py、main.py、features.py、db_switch_service.py、edge_logger.py、system.py、migrate.py、models/cluster.py
- 部署/打包：deployment unit 模板、product/linux/gen-linux.sh
- 测试：`backend/tests/test_code_review_p0.py`（7）、`test_code_review_p1.py`（20）、`test_code_review_p2.py`（19）；3 个旧契约测试翻转为新契约
- commits：`372a8c7f`（报告）、`ab34af7e`、`87afe556`、`da9a4011`
