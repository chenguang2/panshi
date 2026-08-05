## 1. 回归测试（TDD RED）

- [x] 1.1 新增 `tests/test_migrate.py`：三场景（仅旧列 rename 保留数据 / 幂等 / 两列共存回填+删旧列）
- [x] 1.2 运行确认 RED（两列共存场景失败：回填缺失、旧列未删）

## 2. 迁移修复（GREEN）

- [x] 2.1 `migrate.py` 新增 `_merge_legacy_column`（回填空值行 + DROP COLUMN）
- [x] 2.2 `run_migrations` 顺序：merge → rename → add
- [x] 2.3 运行确认 GREEN（3/3 通过）

## 3. 真实库验证

- [x] 3.1 对真实 `data/panshi.db` 执行迁移：8 行数据全部回填到 openresty_path，旧列删除
- [x] 3.2 二次运行确认幂等

## 4. 回归

- [x] 4.1 全量 pytest：885 passed，72 failed 与 baseline 一致（无新增失败）
