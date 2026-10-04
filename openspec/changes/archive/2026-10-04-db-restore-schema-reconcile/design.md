# Design: db-restore-schema-reconcile

## D1 同路径复用（不造第二套迁移）

补齐逻辑镜像 `database.py init_db`：`create_all`（经 `conn.run_sync`）+ `run_migrations(engine)`，作用于重载后的活动引擎。执行点在 `execute_restore` 的 `_engine_reload()` 之后、恢复审计写入之前。禁止在恢复服务里另写一套 DDL——迁移语义唯一实现是 `app/core/migrate.py`（约定 #18 同哲学）。

## D2 先检后补再报

补齐前用 SQLAlchemy `inspect` 对比 `Base.metadata` 与恢复库实际表/列，得到缺失计数；补齐后将计数写入结果载荷（`schema_reconciled` / `tables_added` / `columns_added`）。检测与补齐同事务外串行，无并发面（恢复已被「运行中任务禁止切换」语义串行化）。

## D3 失败容忍

补齐整体 try/except：迁移失败**不得让恢复失败**（库已激活，回滚代价更大）。失败时载荷带 `schema_migration_error`，`restart_recommended` 强制 true——重启后 `init_db` 会重试同一路径。

## D4 载荷契约（新增字段全部向后兼容）

```
schema_reconciled: bool        # 本次是否执行了补齐（检测有落差或空跑均算执行；见 D2 计数）
tables_added: int              # 补建表数
columns_added: int             # 补列数（含 COLUMN_MIGRATIONS 命中项）
key_changed: bool              # 包内 .jwt_secret / .env.* 与恢复前内容不一致（任一即 true）
restart_recommended: bool      # key_changed 或补齐失败时 true
schema_migration_error: str | None
```

`/restore/execute` 现返回 dict 直通，新字段对旧前端透明。

## D5 JWT 常量不可热切（语义文档化）

`security.JWT_SECRET_KEY` 是模块级常量，恢复写盘新密钥后进程内仍持旧钥直到重启。`restart_recommended` 的语义是「重启后密钥/令牌/PG 密文解密完全切换到包内自洽状态」；重启前现有会话仍以旧钥有效（渐进切换，非中断）。同机同密钥恢复 `key_changed=false`，无需重启。

## D6 前端完成面板

`DbBackupRestoreWizard` 第 3 步完成面板在既有指引闭环（重启命令 + 暂存有效期 + 来源标识/位置核对）之上：
- `schema_reconciled && (tables_added + columns_added) > 0` → 显示「已自动补齐 N 张表 / M 列（版本升级对齐）」信息行
- `restart_recommended` → 重启建议行高亮（说明密钥已随包更新，重启后完全生效）
纯展示层改动，不动向导状态机。

## D7 不做的事

- 不做 schema 版本号机制（检测即对比 metadata，无版本表）
- 不自动重启后端（违反 #29/#33 长事务与进程边界，且用户可能还要做别的操作）
- 不在恢复前做检测拦截（补齐是幂等的，事后补齐比事前拦截路径短）
