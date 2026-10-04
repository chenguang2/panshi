# Tasks: db-restore-schema-reconcile

- [x] 1. RED：后端行为测试——构造缺新表/新列的旧 schema 恢复包执行恢复，断言激活后 schema 已补齐且载荷含 `schema_reconciled/tables_added/columns_added`
- [x] 2. RED：key_changed 检测——包内密钥与恢复前不同 → `restart_recommended=true`；相同 → false
- [x] 3. RED：补齐失败容错——patch 迁移抛错，恢复仍成功且载荷带 `schema_migration_error`、`restart_recommended=true`
- [x] 4. GREEN：execute_restore 落地 D1–D4（inspect 先检、init_db 同路径补齐、try/except 容错、载荷字段）
- [x] 5. RED→GREEN：前端完成面板条件化提示（补齐计数信息行 + 重启建议高亮行）+ 源码守卫
- [x] 6. 回归：恢复域测试全量 + `tests/test_pg_dialect_smoke.py`（触写库路径，规则 #103）+ 前端受影响测试
- [x] 7. 归档：`mv changes/db-restore-schema-reconcile changes/archive/2026-10-04-db-restore-schema-reconcile`，delta 按现文合并主 specs
