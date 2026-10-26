# Proposal: cluster-backup-restore-fix

## Why

集群 JSON 备份/恢复功能当前**恢复必失败**（P0）：源集群存在任一「曾发布过」的静态资源时，导入在最终 commit 处抛 `SQLite DateTime type only accepts Python datetime and date objects` → 整个导入事务回滚，前端仅见「服务器内部错误」。根因已实锤（日志 + test 集群 100% 复现）：**导出/导入字段契约漂移**——导出侧 `_serialize` 全列导出把运行态列 `last_published_at` 序列化为 ISO 字符串，导入侧 `_DROP_KEYS` 未覆盖该列，字符串原样绑定 DateTime 列被 SQLite 方言拒绝。该列 2026-10 前恒为 NULL（None 可绑定）故从未暴露；test 集群 `/hello` 于 10-20 发布后首次踩中。排查中还发现两处同源缺陷：导入侧硬编码 Cluster 字段导致 `region_code`（中继区域绑定）静默丢失；静态资源文件在 commit 前落盘，导入失败后磁盘残留孤儿 zip。

## What Changes

- **导入时间字段类型修复（P0 根因，按类修不按列修）**：`_entity_kwargs` 按 ORM 模型元数据对 DateTime/Date 列做通用值矫正——ISO 字符串解析回 naive datetime，非法/缺失置 None；与 BAK-08 白名单同 philosophy，未来新增时间列自动免疫。
- **运行态发布状态不随导入迁移（语义修正）**：`last_publish_ok` / `last_publish_detail` / `last_published_at` 加入导入丢弃清单——新导入集群处于未发布状态，不应继承源集群的发布痕迹（与节点 status 重置为离线、集群 status=1 同语义）。
- **区域绑定随导入保留**：Cluster 导入改为模型感知字段映射（等价 `_entity_kwargs` 路径），`region_code` 等业务列随备份迁移；`name`（用户指定）、`status`（恒 1）、平台管理列（id/created_at/updated_at 等）仍排除。
- **导入失败不留孤儿文件**：静态资源 zip 落盘移到全部 DB 行 flush 成功之后（或 commit 前最后一步），失败路径清理已写文件；保证「失败即无副作用」。
- **导入失败错误可读**：后端将 `StatementError`/`ValueError` 之外的意外异常转译为 400 + 中文原因（含表/资源定位），前端错误区呈现原因与建议动作，不再裸奔「服务器内部错误」。
- **补测试**：按 TDD 先行（RED→GREEN），覆盖「含已发布静态资源的备份可完整导入」「region_code 保留」「失败无孤儿文件」「错误文案可读」；PG 方言冒烟按约定 #103 执行。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `cluster-json-backup`：导入重建的需求修订——时间字段类型矫正、运行态发布状态重置、区域绑定保留、失败无副作用、错误可读。

## Impact

- 后端：`app/services/cluster_backup.py`（`_entity_kwargs` 矫正、`_RUNTIME_STATE_KEYS`、Cluster 导入映射、静态资源落盘时序、异常转译）；`app/api/v1/cluster_backup.py`（错误映射，可选小改）。
- 前端：无结构改动；仅错误文案呈现随后端 detail 契约自然生效（`useClusterBackup.ts` 已支持 `detail.errors` 数组）。
- 兼容性：不改变备份文件格式（version 仍为 1）；旧备份文件在新代码下可导入（本变更正是修复旧文件导入）。
- 风险：低——单文件核心改动、clone-only 单向语义不变（约定 #17）、无 schema 变更（无 COLUMN_MIGRATIONS 项）。
