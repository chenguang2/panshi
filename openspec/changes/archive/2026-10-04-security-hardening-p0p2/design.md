# Design: security-hardening-p0p2

## 修复策略

照 UX 评审批次套路：P0/P1/P2 各一批 TDD、单批单 commit；每批 RED 精确成立 → GREEN → PG 方言冒烟（触写库路径，规则 #103）→ 域定向 → 后端全量。

## 关键设计决策

### 守卫下沉而非调用侧补丁（P2① 的核心思想）

本轮三类事故同构：**守卫在、新路径绕过**（S4 批量腿绕过假成功守卫、M9 raw_delete 漏中继头、M24 nginx 启停缺守卫）。修法是把守卫搬进共享出口（`run_playbook` 唯一出口、`EdgeClient` 底层请求方法），新增调用路径自动免疫——而非在每个调用点重复防御。

### 事务纪律范式（#29 的推广）

「同一请求内先读库、再做长时间外部 IO」若不先结束事务，审计骨架写锁横跨整个 IO 期 → 并发写 `database is locked` 被吞成假 401。范式：**外部 IO 调用前 `await db.commit()`**（同时落库审计）。S2 的三端点与 P1 的三处 SSE 端点统一对齐 relay.py 既有范式。

### 事件循环纯度

同步阻塞体（httpx 串行、同步引擎 connect）一律 `asyncio.to_thread` 卸载；`asyncio.wait_for` 只有在 awaitable 真有 await 点时才可取消。防复发用黑名单制源码守卫（已知阻塞方法清单钉进正则，async 体内裸调即红）——局限是只能拦清单内方法，新增阻塞方法须同步补清单。

### 密钥单源（#20 收官）

JWT 密钥兼 Fernet 密钥，单源 = security 解析链（显式 env → .env.<APP_ENV> → production fail-fast → 开发自动生成）。部署模板与打包脚本全部引用同源；gen-linux.sh 必须把 `.jwt_secret` 与 `db_config.json` 配对随包。

### 有意设计的显式豁免

`db_config.DEFAULT_SQLITE_STORED_PATH = "./data/panshi.db"` 保持相对（存储态须可移植，目录整体迁移后仍指向本树数据；锚定反会造成「迁移后指向旧位置建空库」），解析期锚定。CWD 守卫用行内 `cwd-relative-by-design` 标记豁免，防未来误"修复"。

### M27 勘误方法

「PRAGMA 在隐式事务内是 no-op」论断用实弹探针证伪：SA 逻辑层 `in_transaction()=True` 但 pysqlite driver 层 defer-to-DML 未发真实 BEGIN，PRAGMA 实际生效。按 TDD 纪律不改生产代码，行为测试留作不变量守卫（SA 升级改变 defer 行为会变红）。
