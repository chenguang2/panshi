# Spec: features.yaml hot-reload

## Behavior

- `get_features()` 每次调用时检查 `features.yaml` 的 mtime
- mtime 变化 → 清除缓存 → 重新读取、校验、缓存
- mtime 不变 → 返回缓存值（性能优化）
- 文件删除 → 返回默认空配置
- YAML 解析/校验失败 → `sys.exit(1)`（行为不变）

## Files

- `backend/app/core/features.py` — 唯一变更文件
