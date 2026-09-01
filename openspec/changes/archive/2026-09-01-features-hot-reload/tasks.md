## 1. mtime 缓存失效

- [x] 1.1 `get_features()` 增加 `_features_mtime` 对比，mtime 变化时清除缓存
- [x] 1.2 `load_features()` 成功后记录新 mtime
- [x] 1.3 运行后端测试验证无回归

## 2. 验证

- [x] 2.1 修改 features.yaml → 不重启后端 → API 立即返回新值
- [x] 2.2 恢复文件 → API 恢复原值
