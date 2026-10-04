# Tasks: 2026-10-01-backup-import-guards

> 追溯性建档：代码已合入（3bae5ef1），以下为实际执行记录。

## 1. BAK-08 导入条目级白名单过滤

- [x] 1.1 （RED）`test_cluster_backup_import.py`：含未知字段的备份条目导入 SHALL 成功且未知字段不落库
- [x] 1.2 （GREEN）`cluster_backup.py` `_entity_kwargs(item, cluster_id, model)`：按 `mapper.attrs ∪ 列名` 白名单过滤；全实体调用点传入 model
- [x] 1.3 SSL 错位兼容：白名单含列名 `key`，经 `_ssl_kwargs` 改名 `private_key`

## 2. PLG-07 插件组删除引用守卫

- [x] 2.1 （RED）删除仍被路由引用的插件组 SHALL 400 并列出引用路由
- [x] 2.2 （GREEN）`cluster_plugin_configs.py` delete_db 分支前置扫描 `Route.plugin_config_ids`（畸形 JSON 按「不含引用」），400 明细 ≤3 条 + 「等」
- [x] 2.3 回归：备份导入与插件组域用例通过
