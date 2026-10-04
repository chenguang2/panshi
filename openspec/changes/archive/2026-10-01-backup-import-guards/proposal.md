# Proposal: 2026-10-01-backup-import-guards

## Why

评审批次 BAK-08/PLG-07 两道缺口：① 集群 JSON 备份导入对新版备份文件中的未知条目级字段直接 `TypeError: invalid keyword argument`，整个导入回滚——前向兼容缺失（新版备份在旧版平台导入即失败）；② 插件组可删除但仍被路由 `plugin_config_ids` 引用，删除后路由发布将携带失效引用（对齐 SSL CA 删除守卫的同类守卫缺口）。

## What Changes

- **BAK-08** 导入条目级未知字段按模型白名单过滤：`_entity_kwargs` 增加 model 参数，按 ORM 属性键 ∪ 列名（mapper.columns）过滤，白名单外字段直接丢弃而非报错；白名单含列名以兼容 `SslCertificate.private_key` → 列名 `key` 的错位（约定 #23）；全部实体类型（Node/Upstream/PluginConfig/Route/GlobalRule/PluginMetadata/StreamProxy/StaticResource/SSL）统一走白名单
- **PLG-07** 插件组删除前校验路由引用：`delete_db=true` 时扫描本集群全部 `Route.plugin_config_ids`（JSON 数组，存插件组 edge_uuid），仍有引用则 400 拒绝并列出引用路由（至多展示 3 条 + 「等」），数据库与 Edge 均不删除；畸形 JSON 按「不含引用」处理（与导入期清理语义一致），不阻断删除

## Capabilities

### Modified

- `cluster-json-backup`：「导入前置硬校验」补条目级未知字段白名单过滤语义
- `cluster-plugin-groups`：「插件组 CRUD」补删除前路由引用校验

## Impact

- 后端：`backend/app/services/cluster_backup.py`（`_entity_kwargs` 白名单 + 全实体调用点）、`backend/app/api/v1/cluster_plugin_configs.py`（删除前置校验）
- 测试：`backend/tests/test_cluster_backup_import.py`（未知字段前向兼容用例）、插件组删除引用守卫用例
- 风险：低——白名单过滤只丢弃本版本不认识的字段，已知字段行为不变；删除守卫只收紧（原先可删出失效引用）
